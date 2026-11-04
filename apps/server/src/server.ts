import type { IncomingMessage } from 'node:http';
import { extname } from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastify from 'fastify';
import {
  fastifyTRPCPlugin,
  type CreateFastifyContextOptions,
  type FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import { createDeviceSockets, extractToken, isLoopbackPeer, isSocket, resolveClient, type IsLoopback } from './auth.ts';
import { emptyConfig, type Config } from './config.ts';
import { openDb } from './db/index.ts';
import { run as realRun, type Run } from './exec.ts';
import { createAudioLive } from './modules/audio/live.ts';
import { createMediaLive } from './modules/media/live.ts';
import { createPairingCodes } from './modules/pairing/codes.ts';
import { createPomodoro } from './modules/pomodoro/live.ts';
import { allowedOrigins, isAllowedOrigin } from './origin.ts';
import { appRouter, type AppRouter } from './router.ts';

// `run` and `config` default to the real system and an empty config so tests never touch the desktop or personal files.
// `isLoopback` decides which peer is "the PC"; only `fake.ts` and tests replace it, `index.ts` never does.
export function buildServer({
  dbPath,
  run = realRun,
  config = emptyConfig,
  isLoopback = isLoopbackPeer,
  webRoot,
}: {
  dbPath: string;
  run?: Run;
  config?: Config;
  isLoopback?: IsLoopback;
  /** The built web app (`apps/web/dist`). Without it the server answers the API only. */
  webRoot?: string;
}) {
  const db = openDb(dbPath);
  const app = fastify({ logger: process.env.NODE_ENV !== 'test' });
  app.addHook('onClose', () => db.$client.close());
  const pomodoro = createPomodoro(db, run, config.pomodoro, (err) =>
    app.log.error({ err }, 'Pomodoro deadline failed'),
  );
  app.addHook('onClose', () => pomodoro.close());
  const live = { audio: createAudioLive(run, config), media: createMediaLive(run), pomodoro };
  const pairing = createPairingCodes();
  const sockets = createDeviceSockets();
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
      createContext: async ({ req, res, info }: CreateFastifyContextOptions) => {
        const client = await resolveClient(
          db,
          isLoopback,
          req,
          extractToken(req.headers.authorization, info.connectionParams),
        );
        // For a WebSocket `res` is the socket, whatever the typings say.
        if (client.kind === 'device' && isSocket(res)) sockets.track(client.deviceId, res);
        return { db, run, config, live, client, remoteAddress: req.socket.remoteAddress ?? '', pairing, sockets };
      },
      keepAlive: { enabled: true, pingMs: 30_000, pongWaitMs: 5_000 },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });
  if (webRoot) {
    app.register(fastifyStatic, { root: webRoot });
    // /deck and /desk are client-side routes with no file behind them; a missing file with an extension stays a 404.
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split('?')[0] ?? '';
      return req.method === 'GET' && !path.startsWith('/trpc') && !extname(path)
        ? reply.sendFile('index.html')
        : reply.code(404).send({ error: 'Not found' });
    });
  }
  return app;
}
