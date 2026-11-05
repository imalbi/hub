/* oxlint-disable no-underscore-dangle -- Compose the existing typed router record with registry discovery. */
import { router } from './core/trpc.ts';
import { createRegistryRouter } from './core/registry.ts';
import type { ModuleDefinition, ModuleDeps, ModuleInstance } from './core/module.ts';
import type { publicModules } from './modules.ts';

export function createAppRouter<const T extends readonly ModuleDefinition[]>(
  modules: T,
  deps: ModuleDeps,
  config: Record<string, unknown>,
  onClose: (close: NonNullable<ModuleInstance['close']>) => void,
  extra: Record<string, ModuleInstance['router']> = {},
) {
  type Entries = { [M in T[number] as M['name']]: ReturnType<M['create']>['router'] };
  const entries = modules.map((definition) => {
    const instance = definition.create({ ...deps, config: config[definition.name] });
    if (instance.close) onClose(instance.close);
    return [definition.name, instance.router];
  });
  // fromEntries erases the literal name/router association; extra routers remain runtime-only.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tRPC consumes the mapped record proven by each factory.
  const app = router({ ...Object.fromEntries(entries), ...extra } as Entries);
  return router({ ...app._def.record, registry: createRegistryRouter(() => app) });
}

export type AppRouter = ReturnType<typeof createAppRouter<typeof publicModules>>;
