import { createFiles } from './core/files.ts';
import { registerMcp } from './core/mcp.ts';
import { createConfirmations } from './core/confirmations.ts';
import { registerFiles } from './core/file-routes.ts';
import type { IncomingMessage } from 'node:http';
import type { AnyRouter } from '@trpc/server';
import { extname } from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastify from 'fastify';
import {
  fastifyTRPCPlugin,
  type CreateFastifyContextOptions,
  type FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import {
  createDeviceSockets,
  extractToken,
  isLoopbackPeer,
  isSocket,
  resolveClient,
  type IsLoopback,
} from './core/auth.ts';
import { emptyConfig, type Config } from './core/config.ts';
import { openDb } from './db/index.ts';
import { run as realRun, streamSpawn, type Run, type StreamSpawn } from './core/exec.ts';
import { createJobRunner } from './core/jobs.ts';
import { publicModules } from './modules.ts';
import { createMusicModule } from './modules/music/server.ts';
import { discoverModules } from './core/discovery.ts';
import { allowedOrigins, isAllowedOrigin } from './core/origin.ts';
import { createModuleStates } from './core/module-states.ts';
import { createAppRouter, type AppRouter } from './router.ts';

// `run` and `config` default to the real system and an empty config so tests never touch the desktop or personal files.
// `isLoopback` decides which peer is "the PC"; only `fake.ts` and tests replace it, `index.ts` never does.
export function buildServer({
  dbPath,
  deps = {},
  config = emptyConfig,
  isLoopback = isLoopbackPeer,
  webRoot,
  moduleRoots = [],
  exampleModules = process.env.HUB_EXAMPLE_MODULES === '1',
  onlyModules,
  settings,
  music,
}: {
  dbPath: string;
  music?: Parameters<typeof createMusicModule>[0];
  deps?: {
    run?: Run;
    fetch?: typeof fetch;
    spawn?: StreamSpawn;
    onJobs?: (jobs: ReturnType<typeof createJobRunner>) => void;
    testRouters?: Record<string, AnyRouter>;
  };
  config?: Config;
  isLoopback?: IsLoopback;
  /** The built web app (`apps/web/dist`). Without it the server answers the API only. */
  webRoot?: string;
  moduleRoots?: readonly string[];
  exampleModules?: boolean;
  /** Folder names of the module roots to load; unset loads all. For tests, like `isLoopback`: `index.ts` never sets it. */
  onlyModules?: readonly string[];
  /**
   * Without it Impostazioni can read module states but not the config file. `onRestart` runs once the response to a
   * save is sent: `index.ts` exits with a code the service manager restarts on, the e2e fake restarts in place. Left
   * out, a save writes the file and answers `restarting: false` (a dev server nobody would start again).
   */
  settings?: { configPath: string; onRestart?: () => void };
}) {
  const run = deps.run ?? realRun;
  const db = openDb(dbPath);
  const jobs = createJobRunner(db, deps.spawn ?? streamSpawn, config.jobs.maxConcurrent);
  deps.onJobs?.(jobs);
  const app = fastify({
    logger: process.env.NODE_ENV !== 'test',
    // A tRPC HTTP batch puts every procedure in one path parameter; the default 100 refused a page's batch with 414.
    routerOptions: { maxParamLength: 5000 },
  });
  app.addHook('onClose', () => db.$client.close());
  app.addHook('onClose', () => jobs.close());
  const files = createFiles();
  app.addHook('onClose', () => files.close());
  app.register(async (scope) =>
    registerFiles(scope, {
      db,
      files,
      isLoopback,
      maxUploadMb: config.files?.maxUploadMb ?? 25,
      origins: allowedOrigins(config),
    }),
  );
  const sockets = createDeviceSockets();
  const confirmations = createConfirmations();
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
  app.register(async (scope) => {
    const discoveredDeps = {
      run,
      fetch: deps.fetch ?? fetch,
      log: app.log,
      zones: new Set(publicModules.flatMap((m) => m.zones ?? [])),
    };
    const moduleDeps = { ...discoveredDeps, db };
    const onClose = (close: () => void | Promise<void>) => {
      scope.addHook('onClose', close);
    };
    const states = createModuleStates();
    const extra = await discoverModules({
      roots: moduleRoots,
      examples: exampleModules,
      onlyModules,
      reserved: [...publicModules.map((m) => m.name), 'registry', 'settings', 'modules', 'agents', 'confirmations'],
      deps: discoveredDeps,
      dbPath,
      config: config.modules ?? {},
      onClose,
      states,
      off: config.modulesOff,
    });
    const modules = music
      ? publicModules.map((module) => (module.name === 'music' ? createMusicModule(music) : module))
      : publicModules;
    const appRouter = createAppRouter(
      modules,
      moduleDeps,
      config,
      onClose,
      { ...extra, ...deps.testRouters },
      {
        states,
        off: config.modulesOff,
        dbPath,
        configPath: settings?.configPath,
        jobs,
        confirmations,
      },
    );
    if (config.mcp.enabled)
      registerMcp(scope, allowlist, isLoopback, db, appRouter, confirmations, {
        db,
        run,
        jobs,
        config,
        files,
        sockets,
        restart: () => {
          if (!settings?.onRestart) return false;
          setTimeout(settings.onRestart, 200);
          return true;
        },
      });
    scope.register(fastifyTRPCPlugin, {
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
          return {
            db,
            run,
            jobs,
            config,
            files,
            client,
            remoteAddress: req.socket.remoteAddress ?? '',
            sockets,
            restart: () => {
              const exit = settings?.onRestart;
              if (!exit) return false;
              // A WebSocket reply is the socket itself and has no `finish`; HTTP is the one real path.
              if (isSocket(res)) setTimeout(exit, 200);
              else res.raw.once('finish', exit);
              return true;
            },
          };
        },
        keepAlive: { enabled: true, pingMs: 30_000, pongWaitMs: 5_000 },
      } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
    });
  });
  if (webRoot) {
    app.register(fastifyStatic, { root: webRoot });
    // /deck and /desk are client-side routes with no file behind them; a missing file with an extension stays a 404.
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split('?')[0] ?? '';
      return req.method === 'GET' && !path.startsWith('/trpc') && !path.startsWith('/files') && !extname(path)
        ? reply.sendFile('index.html')
        : reply.code(404).send({ error: 'Not found' });
    });
  }
  return app;
}
