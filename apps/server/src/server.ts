import fastify from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { emptyConfig, type Config } from './config.ts';
import { openDb } from './db/index.ts';
import { run as realRun, type Run } from './exec.ts';
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
  app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext: () => ({ db, run, config }),
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });
  return app;
}
