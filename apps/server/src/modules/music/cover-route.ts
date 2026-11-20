import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/index.ts';
import { extractToken, resolveClient, type IsLoopback } from '../../core/auth.ts';
import { isAllowedOrigin } from '../../core/origin.ts';

export type CoverImage = {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: Buffer;
};

const trackIdPattern = /^[A-Za-z0-9_-]{11}$/;

/** Serve cached binary music covers on `/music/cover/:id` with the same peer/origin boundary as `/files`. */
export function registerMusicCoverRoute(
  app: FastifyInstance,
  {
    db,
    isLoopback,
    origins,
    readCover,
  }: {
    db: Db;
    isLoopback: IsLoopback;
    origins: readonly string[];
    readCover: (id: string) => Promise<CoverImage | null>;
  },
) {
  app.addHook('onRequest', async (req, reply) => {
    const { origin } = req.headers;
    if (origin !== undefined && !isAllowedOrigin(origin, origins))
      return reply.code(403).send({ error: 'Origin not allowed' });
    if (req.headers['sec-fetch-site'] === 'cross-site')
      return reply.code(403).send({ error: 'Cross-site request not allowed' });
    const client = await resolveClient(db, isLoopback, req, extractToken(req.headers.authorization, null));
    if (client.kind === 'anonymous') return reply.code(401).send({ error: 'Pair this device first' });
    return undefined;
  });

  app.get<{ Params: { id: string } }>('/music/cover/:id', async (req, reply) => {
    if (!trackIdPattern.test(req.params.id)) return reply.code(400).send({ error: 'Invalid track id' });
    const image = await readCover(req.params.id);
    if (!image) return reply.code(404).header('cache-control', 'no-store').send({ error: 'Cover unavailable' });
    return reply
      .header('cache-control', 'private, max-age=86400')
      .header('x-content-type-options', 'nosniff')
      .header('cross-origin-resource-policy', 'same-origin')
      .type(image.mime)
      .send(image.bytes);
  });
}
