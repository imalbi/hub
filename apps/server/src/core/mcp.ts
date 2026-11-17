import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ToolSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { callTRPCProcedure, type AnyRouter } from '@trpc/server';
import type { FastifyInstance } from 'fastify';
import { isAllowedOrigin } from './origin.ts';
import { extractToken, resolveAgent, type IsLoopback } from './auth.ts';
import type { Db } from '../db/index.ts';
import { listActions } from './registry.ts';
import { callAgentAction } from './agent-action.ts';
import type { Context } from './trpc.ts';
import type { createConfirmations } from './confirmations.ts';

export function registerMcp(
  app: FastifyInstance,
  origins: readonly string[],
  isLoopback: IsLoopback,
  db: Db,
  router: AnyRouter,
  confirmations: ReturnType<typeof createConfirmations>,
  baseContext: Omit<Context, 'client' | 'remoteAddress'>,
) {
  app.all('/mcp', async (req, reply) => {
    if (req.headers.origin !== undefined && !isAllowedOrigin(req.headers.origin, origins))
      return reply.code(403).send({ error: 'Origin not allowed' });
    const resolved = await resolveAgent(db, extractToken(req.headers.authorization, null));
    if (!isLoopback(req) && resolved.kind !== 'agent') return reply.code(401).send({ error: 'Agent token required' });
    const client = resolved.kind === 'agent' ? resolved : { kind: 'agent' as const, agentId: 0, name: 'Locale' };
    if (req.method === 'GET') return reply.code(405).send();
    const server = new Server({ name: 'hub', version: '1' }, { capabilities: { tools: {}, resources: {} } });
    // tRPC exposes its procedures through _def, as in registry.ts.
    // oxlint-disable-next-line no-underscore-dangle
    const procedures = router._def.procedures;
    const resources = Object.entries(procedures).flatMap(([path, procedure]) => {
      const separator = path.lastIndexOf('.');
      const parent = path.slice(0, separator);
      const field = path.slice(separator + 1);
      const subscription = procedures[`${parent}.on${field.charAt(0).toUpperCase()}${field.slice(1)}`];
      if (!subscription || typeof procedure !== 'function' || !('_def' in procedure)) return [];
      const definition = procedure._def;
      if (
        typeof definition !== 'object' ||
        definition === null ||
        !('type' in definition) ||
        definition.type !== 'query' ||
        !('inputs' in definition) ||
        !Array.isArray(definition.inputs) ||
        definition.inputs.length
      )
        return [];
      const name = field === 'state' ? parent : `${parent}/${field}`;
      return [{ uri: `hub://${name}`, name, path }];
    });
    server.setRequestHandler(ListResourcesRequestSchema, () => ({
      resources: resources.map(({ uri, name }) => ({ uri, name, mimeType: 'application/json' })),
    }));
    server.setRequestHandler(ReadResourceRequestSchema, async ({ params }) => {
      const resource = resources.find(({ uri }) => uri === params.uri);
      if (!resource) throw new Error('Unknown resource');
      const result = await callTRPCProcedure({
        router,
        path: resource.path,
        type: 'query',
        ctx: { ...baseContext, client, remoteAddress: req.socket.remoteAddress ?? '' },
        getRawInput: async () => undefined,
        signal: undefined,
        batchIndex: 0,
      });
      return {
        contents: [{ uri: resource.uri, mimeType: 'application/json', text: JSON.stringify(result) ?? 'null' }],
      };
    });
    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: listActions(router)
        .filter((action) => !action.pageOnly)
        .map((action) =>
          ToolSchema.parse({
            name: action.path,
            description: action.description,
            inputSchema: action.schema ?? { type: 'object' },
          }),
        ),
    }));
    server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      const { result, isError } = await callAgentAction(
        router,
        confirmations,
        { ...baseContext, client, remoteAddress: req.socket.remoteAddress ?? '' },
        client,
        params.name,
        params.arguments,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result) ?? 'null' }], ...(isError && { isError: true }) };
    });
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    await server.connect(transport);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value);
    const request = new Request('http://localhost/mcp', { method: req.method, headers });
    const response = await transport.handleRequest(request, { parsedBody: req.body });
    response.headers.forEach((value, name) => {
      reply.header(name, value);
    });
    const body = await response.text();
    await server.close();
    return reply.code(response.status).send(body);
  });
}
