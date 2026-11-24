/* oxlint-disable no-underscore-dangle -- Compose the existing typed router record with registry discovery. */
import { moduleDbPath, openDatabase } from './db/index.ts';
import { router } from './core/trpc.ts';
import { createRegistryRouter } from './core/registry.ts';
import { createAssistantRouter } from './core/assistant.ts';
import { createConfirmations } from './core/confirmations.ts';
import { createConfirmationsRouter } from './core/confirmations-router.ts';
import { agentsRouter } from './core/agents-router.ts';
import { createJobRunner } from './core/jobs.ts';
import { createBackup, createBackupRouter, type Backup } from './core/backup.ts';
import { createJobsRouter } from './core/jobs-router.ts';
import { streamSpawn } from './core/exec.ts';
import { createEnabledRouter, createSettingsRouter } from './core/settings-router.ts';
import { createCatalogService, type CatalogService } from './core/catalog.ts';
import { createCatalogRouter } from './core/catalog-router.ts';
import { RESERVED_CORE_NAMES } from './core/catalog-manifest.ts';
import { installedRoot, privateRoot, reposRoot } from './core/discovery.ts';
import type { ModuleDefinition, ModuleDeps, ModuleInstance } from './core/module.ts';
import { configSchemaOf, createModuleStates, type ModuleStates } from './core/module-states.ts';
import type { publicModules } from './modules.ts';

export function createAppRouter<const T extends readonly ModuleDefinition[]>(
  modules: T,
  deps: ModuleDeps,
  config: Record<string, unknown>,
  onClose: (close: NonNullable<ModuleInstance['close']>) => void,
  extra: Record<string, ModuleInstance['router']> = {},
  {
    states = createModuleStates(),
    off = [],
    configPath,
    dbPath = ':memory:',
    jobs = createJobRunner(deps.db, streamSpawn, 2),
    confirmations = createConfirmations(),
    backup = createBackup({ dbPath }),
    catalog,
  }: {
    states?: ModuleStates;
    off?: readonly string[];
    configPath?: string;
    dbPath?: string;
    jobs?: ReturnType<typeof createJobRunner>;
    confirmations?: ReturnType<typeof createConfirmations>;
    backup?: Backup;
    catalog?: CatalogService;
  } = {},
) {
  type Entries = { [M in T[number] as M['name']]: ReturnType<M['create']>['router'] };
  const entries = modules.map((definition) => {
    const info = {
      name: definition.name,
      kind: 'public',
      schema: configSchemaOf(definition.settingsSchema ?? definition.config),
      configPath: [definition.name],
      setupNote: definition.setupNote,
    } as const;
    // A module that is off is not created: no router, no timers. tRPC answers NOT_FOUND for its paths, and
    // `settings.modules` (the states) is how clients learn it is off.
    if (off.includes(definition.name)) {
      states.set({ ...info, status: 'off' });
      return [definition.name, router({})];
    }
    // A public module that fails to open its database or to start stops the server, as before: it is shipped code.
    const ownDb = definition.migrations
      ? openDatabase(moduleDbPath(dbPath, definition.name), definition.migrations)
      : undefined;
    if (ownDb) {
      backup.add(definition.name, ownDb.$client);
      onClose(() => ownDb.$client.close());
    }
    const instance = definition.create({ ...deps, ...(ownDb && { db: ownDb }), config: config[definition.name] });
    if (instance.close) onClose(instance.close);
    states.set({ ...info, status: 'on' });
    return [definition.name, instance.router];
  });
  // fromEntries erases the literal name/router association; extra routers remain runtime-only.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tRPC consumes the mapped record proven by each factory.
  const app = router({ ...Object.fromEntries(entries), ...extra, jobs: createJobsRouter(jobs) } as Entries & {
    jobs: ReturnType<typeof createJobsRouter>;
  });
  const settings = createSettingsRouter({ states, configPath });
  const backupRouter = createBackupRouter(backup);
  const confirmationRouter = createConfirmationsRouter(confirmations);
  const effectiveCatalog =
    catalog ??
    createCatalogService({
      db: deps.db,
      run: deps.run,
      jobs,
      reposDir: reposRoot,
      installedDir: installedRoot,
      localDir: privateRoot,
      reservedNames: new Set([...modules.map((m) => m.name), ...RESERVED_CORE_NAMES]),
    });
  if (!catalog) onClose(() => effectiveCatalog.close());
  const registered = router({
    ...app._def.record,
    settings,
    agents: agentsRouter,
    confirmations: confirmationRouter,
    backup: backupRouter,
  });
  return router({
    ...app._def.record,
    assistant: createAssistantRouter(() => registered, confirmations, deps.fetch),
    registry: createRegistryRouter(() => registered),
    settings,
    agents: agentsRouter,
    confirmations: confirmationRouter,
    backup: backupRouter,
    modules: createEnabledRouter(states),
    // Mounted only outside `registered` so MCP agents, `registry.list`, palette, and assistant never see or call it.
    catalog: createCatalogRouter(effectiveCatalog),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter<typeof publicModules>>;
