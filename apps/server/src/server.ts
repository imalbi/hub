import type { IncomingMessage } from 'node:http';
import fastifyWebsocket from '@fastify/websocket';
import fastify from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { emptyConfig, type Config } from './config.ts';
import { openDb } from './db/index.ts';
import { run as realRun, type Run } from './exec.ts';
import { createAudioLive } from './modules/audio/live.ts';
import { createMediaLive } from './modules/media/live.ts';
import { allowedOrigins, isAllowedOrigin } from './origin.ts';
import { appRouter, type AppRouter } from './router.ts';

// `run` and `config` default to the real system and an empty config so tests never touch the desktop or personal files.
export function buildServer({
  dbPath,
  run = realRun,
  config = emptyConfig,
}: {
  dbPath: string;
  run?: Run;
  config?: Config;
}) {
  const db = openDb(dbPath);
  const app = fastify({ logger: process.env.NODE_ENV !== 'test' });
  app.addHook('onClose', () => db.$client.close());
  const live = { audio: createAudioLive(run, config), media: createMediaLive(run) };
  const allowlist = allowedOrigins(config);
  // CORS does not cover WebSockets, so any page open in the browser could otherwise drive the desktop through
  // localhost. `verifyClient` runs inside the upgrade, before the connection is bound.
  app.register(fastifyWebsocket, {
    options: {
      // The 2-argument form is the one that can answer 403; `origin` is undefined when the header is missing.
      verifyClient: (
        { origin, req }: { origin: string | undefined; req: IncomingMessage },
        done: (verified: boolean, code?: number, message?: string) => void,
      ) => {
        if (isAllowedOrigin(origin, allowlist)) return done(true);
        app.log.warn({ origin, url: req.url }, 'WebSocket upgrade refused: origin not allowed');
        done(false, 403, 'Origin not allowed');
      },
    },
  });
  // Registered after @fastify/websocket on purpose: the tRPC plugin's WebSocket route needs it.
  app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    useWSS: true,
    trpcOptions: {
      router: appRouter,
      createContext: () => ({ db, run, config, live }),
      keepAlive: { enabled: true, pingMs: 30_000, pongWaitMs: 5_000 },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });
  return app;
}
