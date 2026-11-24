import { createFocusHistory } from './core/focus-history.ts';
import { createFiles } from './core/files.ts';
import { registerMcp } from './core/mcp.ts';
import { createConfirmations } from './core/confirmations.ts';
import { registerFiles } from './core/file-routes.ts';
import type { IncomingMessage } from 'node:http';
import type { AnyRouter } from '@trpc/server';
import { extname } from 'node:path';
import fastifyHelmet from '@fastify/helmet';
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
import { registerMusicCoverRoute, type CoverImage } from './modules/music/cover-route.ts';
import { createMusicModule } from './modules/music/server.ts';
import { discoverModules, installedRoot, privateRoot, reposRoot } from './core/discovery.ts';
import { createCatalogService } from './core/catalog.ts';
import { allowedOrigins, isAllowedHost, isAllowedOrigin } from './core/origin.ts';
import { createModuleStates } from './core/module-states.ts';
import { createBackup, startDailyCheck } from './core/backup.ts';
import { createAppRouter, type AppRouter } from './router.ts';

const stripQuery = (url: string | undefined) => (url ?? '').split('?')[0] ?? '';

/** Fastify request log serializer that removes query strings so input payloads never reach journal logs. */
export function serializeRequest(req: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  host?: string;
  hostname?: string;
  ip?: string;
  remoteAddress?: string;
  remotePort?: number;
  socket?: { remotePort?: number };
}) {
  const acceptVersion = req.headers?.['accept-version'];
  return {
    method: req.method ?? '',
    url: stripQuery(req.url),
    version: typeof acceptVersion === 'string' ? acceptVersion : undefined,
    host: req.host ?? req.hostname,
    remoteAddress: req.ip ?? req.remoteAddress,
    remotePort: req.socket?.remotePort ?? req.remotePort,
  };
}

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
  catalog,
  music,
  autoBackup = false,
}: {
  dbPath: string;
  music?: Parameters<typeof createMusicModule>[0];
  deps?: {
    run?: Run;
    fetch?: typeof fetch;
    spawn?: StreamSpawn;
    onJobs?: (jobs: ReturnType<typeof createJobRunner>) => void;
    onConfirmations?: (confirmations: ReturnType<typeof createConfirmations>) => void;
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
  catalog?: {
    reposDir?: string;
    installedDir?: string;
    localDir?: string;
    buildCommand?: { bin: string; args: string[] };
    onRestart?: () => void;
  };
  /** Starts the daily copy check. Only `index.ts` sets it: tests and the e2e fake run a copy through `backup.run`. */
  autoBackup?: boolean;
}) {
  const run = deps.run ?? realRun;
  const db = openDb(dbPath);
  const backup = createBackup({
    dbPath,
    core: db.$client,
    enabled: config.backup.enabled,
    dir: config.backup.dir,
    keep: config.backup.keep,
  });
  const jobs = createJobRunner(db, deps.spawn ?? streamSpawn, config.jobs.maxConcurrent);
  deps.onJobs?.(jobs);
  const allowlist = allowedOrigins(config);
  const app = fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { serializers: { req: serializeRequest } },
    // A tRPC HTTP batch puts every procedure in one path parameter; the default 100 refused a page's batch with 414.
    routerOptions: { maxParamLength: 5000 },
  });
  app.register(fastifyHelmet, {
    global: true,
    hsts: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    noSniff: true,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
      },
    },
  });
  app.addHook('onRequest', async (req, reply) => {
    if (!isAllowedHost(req.headers.host, allowlist))
      return reply.header('connection', 'close').code(421).send({ error: 'Host not allowed' });
    return undefined;
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
      origins: allowlist,
    }),
  );
  const sockets = createDeviceSockets();
  const confirmations = createConfirmations();
  deps.onConfirmations?.(confirmations);
  // CORS does not cover WebSockets, so any page open in the browser could otherwise drive the desktop through
  // localhost. `verifyClient` runs inside the upgrade, before the connection is bound.
  app.register(fastifyWebsocket, {
    options: {
      maxPayload: 1 << 20,
      // The 2-argument form is the one that can answer 403; `origin` is undefined when the header is missing.
      verifyClient: (
        { origin, req }: { origin: string | undefined; req: IncomingMessage },
        done: (verified: boolean, code?: number, message?: string) => void,
      ) => {
        if (!isAllowedHost(req.headers.host, allowlist)) {
          app.log.warn({ url: stripQuery(req.url) }, 'WebSocket upgrade refused: host not allowed');
          return done(false, 421, 'Host not allowed');
        }
        if (isAllowedOrigin(origin, allowlist)) return done(true);
        app.log.warn(
          { originPresent: origin !== undefined, url: stripQuery(req.url) },
          'WebSocket upgrade refused: origin not allowed',
        );
        return done(false, 403, 'Origin not allowed');
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
      focusHistory: createFocusHistory(db),
    };
    const moduleDeps = { ...discoveredDeps, db };
    const onClose = (close: () => void | Promise<void>) => {
      scope.addHook('onClose', close);
    };
    const states = createModuleStates();
    const reserved = [
      ...publicModules.map((m) => m.name),
      'registry',
      'settings',
      'modules',
      'agents',
      'confirmations',
      'backup',
      'assistant',
      'jobs',
      'catalog',
    ];
    const extra = await discoverModules({
      roots: moduleRoots,
      examples: exampleModules,
      onlyModules,
      reserved,
      deps: discoveredDeps,
      dbPath,
      config: config.modules ?? {},
      onClose,
      states,
      off: config.modulesOff,
      onDb: backup.add,
    });
    const catalogService = createCatalogService({
      db,
      run,
      jobs,
      reposDir: catalog?.reposDir ?? process.env.HUB_CATALOG_REPOS_DIR ?? reposRoot,
      installedDir: catalog?.installedDir ?? process.env.HUB_CATALOG_INSTALLED_DIR ?? installedRoot,
      localDir: catalog?.localDir ?? privateRoot,
      reservedNames: new Set(reserved),
      buildCommand: catalog?.buildCommand,
      onRestart: catalog?.onRestart ?? settings?.onRestart,
    });
    onClose(() => catalogService.close());
    let readMusicCover: ((id: string) => Promise<CoverImage | null>) | undefined;
    const modules = publicModules.map((module) =>
      module.name === 'music'
        ? createMusicModule({
            ...music,
            onCover: (read) => {
              readMusicCover = read;
            },
          })
        : module,
    );
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
        backup,
        catalog: catalogService,
      },
    );
    scope.register(async (musicScope) =>
      registerMusicCoverRoute(musicScope, {
        db,
        isLoopback,
        origins: allowlist,
        readCover: (id) => readMusicCover?.(id) ?? Promise.resolve(null),
      }),
    );
    if (autoBackup) onClose(startDailyCheck(backup).stop);
    // Last hook of the scope, so it runs first: a copy in progress finishes before any module or core handle closes.
    onClose(() => backup.close());
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
    scope.register(
      (trpcScope, _opts, done) => {
        trpcScope.addHook('onRequest', async (req, reply) => {
          const { origin } = req.headers;
          if (origin !== undefined && !isAllowedOrigin(origin, allowlist))
            return reply.header('connection', 'close').code(403).send({ error: 'Origin not allowed' });
          if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
            const contentType = req.headers['content-type'];
            const mediaType = typeof contentType === 'string' ? contentType.split(';')[0]?.trim().toLowerCase() : '';
            if (mediaType !== 'application/json')
              return reply.code(415).send({ error: 'Content-Type must be application/json' });
          }
          return undefined;
        });
        fastifyTRPCPlugin(
          trpcScope,
          {
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
              onError: ({ error, path }) => {
                if (error.code === 'INTERNAL_SERVER_ERROR')
                  app.log.error({ path, err: error.cause ?? error }, 'tRPC internal error');
              },
              keepAlive: { enabled: true, pingMs: 30_000, pongWaitMs: 5_000 },
            } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
          },
          (err) => {
            if (err) return done(err);
            // Defense in depth: onRequest rejects non-JSON first, and this scope accepts no multipart bodies.
            trpcScope.removeContentTypeParser('multipart/form-data');
            done();
          },
        );
      },
      { prefix: '/trpc' },
    );
  });
  if (webRoot) {
    app.register(fastifyStatic, { root: webRoot });
    // /deck and /desk are client-side routes with no file behind them; a missing file with an extension stays a 404.
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split('?')[0] ?? '';
      return req.method === 'GET' &&
        !path.startsWith('/trpc') &&
        !path.startsWith('/files') &&
        !path.startsWith('/music/') &&
        path !== '/mcp' &&
        !path.startsWith('/mcp/') &&
        !extname(path)
        ? reply.sendFile('index.html')
        : reply.code(404).send({ error: 'Not found' });
    });
  }
  return app;
}
