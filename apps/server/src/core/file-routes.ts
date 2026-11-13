/* oxlint-disable no-control-regex -- File names must reject HTTP header control characters. */
import { createReadStream } from 'node:fs';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { TRPCError } from '@trpc/server';
import type { Db } from '../db/index.ts';
import { extractToken, resolveClient, type IsLoopback } from './auth.ts';
import type { Files } from './files.ts';
import { isAllowedOrigin } from './origin.ts';

export async function registerFiles(
  app: FastifyInstance,
  {
    db,
    files,
    isLoopback,
    maxUploadMb,
    origins,
  }: { db: Db; files: Files; isLoopback: IsLoopback; maxUploadMb: number; origins: readonly string[] },
) {
  await app.register(multipart, {
    limits: { fileSize: Math.floor(maxUploadMb * 1024 * 1024), files: 1, fields: 0, parts: 1 },
    throwFileSizeLimit: true,
  });
  app.addHook('onRequest', async (req, reply) => {
    // A multipart POST needs no preflight, so any page open on the PC could otherwise upload from loopback.
    // Browsers send Origin on every POST; the hub's own pages are on the allowlist, clients without one (curl) pass.
    const { origin } = req.headers;
    if (origin !== undefined && !isAllowedOrigin(origin, origins))
      return reply.code(403).send({ error: 'Origin not allowed' });
    const client = await resolveClient(db, isLoopback, req, extractToken(req.headers.authorization, null));
    if (client.kind === 'anonymous') return reply.code(401).send({ error: 'Pair this device first' });
    return undefined;
  });
  app.post('/files', async (req, reply) => {
    let uploaded: { data: Buffer; name: string; mime: string } | undefined;
    // Drain the iterator before saving: a second part must fail, never leave an accepted partial upload.
    for await (const part of req.parts()) {
      if (part.type === 'file') uploaded = { data: await part.toBuffer(), name: part.filename, mime: part.mimetype };
    }
    if (!uploaded) return reply.code(400).send({ error: 'One file is required' });
    const name =
      uploaded.name
        .split(/[\\/]/)
        .at(-1)
        ?.replace(/[\x00-\x1f\x7f]/g, '')
        .slice(0, 255) || 'file';
    return files.put(uploaded.data, {
      name,
      mime: /^[\w.+-]+\/[\w.+-]+$/.test(uploaded.mime) ? uploaded.mime : 'application/octet-stream',
    });
  });
  app.get<{ Params: { id: string }; Querystring: { inline?: string } }>('/files/:id', async (req, reply) => {
    try {
      const file = await files.get(req.params.id);
      const disposition = req.query.inline === '1' && file.mime === 'application/pdf' ? 'inline' : 'attachment';
      return reply
        .header('content-disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`)
        .header('x-content-type-options', 'nosniff')
        .type(file.mime)
        .send(createReadStream(file.path));
    } catch (error) {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND')
        return reply.code(404).send({ error: 'File not found or expired' });
      throw error;
    }
  });
}
