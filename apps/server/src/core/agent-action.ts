import { callTRPCProcedure, type AnyRouter } from '@trpc/server';
import type { Context } from './trpc.ts';
import type { createConfirmations } from './confirmations.ts';
import { listActions } from './registry.ts';
import { recordAgentCall } from './agent-audit.ts';

export async function callAgentAction(
  router: AnyRouter,
  confirmations: ReturnType<typeof createConfirmations>,
  context: Context,
  client: Extract<Context['client'], { kind: 'agent' }>,
  name: string,
  args: Record<string, unknown> = {},
) {
  const db = context.db;
  const started = Date.now();
  const action = listActions(router)
    .filter((action) => !action.pageOnly)
    .find(({ path }) => path === name);
  let result: unknown;
  let isError = false;
  try {
    if (!action) throw new Error('Unknown tool');
    const input = action.schema === null ? undefined : (args ?? {});
    const ctx: Context = { ...context, client };
    const invoke = (context: Context, raw: unknown) =>
      callTRPCProcedure({
        router,
        path: action.path,
        type: action.kind,
        ctx: context,
        getRawInput: async () => raw,
        signal: undefined,
        batchIndex: 0,
      });
    if (action.danger) {
      const id = confirmations.request({
        agentId: client.agentId,
        name: client.name,
        action: action.path,
        input,
        run: () => invoke({ ...ctx, client: { kind: 'loopback' }, agentRequest: true }, { ...args, confirmed: true }),
      });
      if (!id) throw new Error('No desk or deck client connected');
      result = { status: 'awaiting confirmation', id };
    } else result = await invoke(ctx, input);
  } catch (error) {
    isError = true;
    result = { error: error instanceof Error ? error.message : 'Action failed' };
  }
  await recordAgentCall(db, {
    agentId: client.agentId || null,
    name: client.name,
    action: name,
    input: args ?? {},
    result,
    durationMs: Date.now() - started,
  });
  return { result, isError };
}
