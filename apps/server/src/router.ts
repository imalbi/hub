/* oxlint-disable no-underscore-dangle -- Compose the existing typed router record with registry discovery. */
import { router } from './core/trpc.ts';
import { createRegistryRouter } from './core/registry.ts';
import { createEnabledRouter, createSettingsRouter } from './core/settings-router.ts';
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
  }: { states?: ModuleStates; off?: readonly string[]; configPath?: string } = {},
) {
  type Entries = { [M in T[number] as M['name']]: ReturnType<M['create']>['router'] };
  const entries = modules.map((definition) => {
    const info = {
      name: definition.name,
      kind: 'public',
      schema: configSchemaOf(definition.settingsSchema ?? definition.config),
      configPath: [definition.name],
    } as const;
    // A module that is off is not created: no router, no timers. tRPC answers NOT_FOUND for its paths, and
    // `settings.modules` (the states) is how clients learn it is off.
    if (off.includes(definition.name)) {
      states.set({ ...info, status: 'off' });
      return [definition.name, router({})];
    }
    const instance = definition.create({ ...deps, config: config[definition.name] });
    if (instance.close) onClose(instance.close);
    states.set({ ...info, status: 'on' });
    return [definition.name, instance.router];
  });
  // fromEntries erases the literal name/router association; extra routers remain runtime-only.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tRPC consumes the mapped record proven by each factory.
  const app = router({ ...Object.fromEntries(entries), ...extra } as Entries);
  return router({
    ...app._def.record,
    registry: createRegistryRouter(() => app),
    settings: createSettingsRouter({ states, configPath }),
    modules: createEnabledRouter(states),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter<typeof publicModules>>;
