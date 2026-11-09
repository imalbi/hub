import { z } from 'zod';

export type ModuleStatus = 'on' | 'off' | 'failed';

export type ModuleInfo = {
  name: string;
  /** `public` modules ship with the engine; `private` is every discovered one (the example module included). */
  kind: 'public' | 'private';
  status: ModuleStatus;
  /** Kept for off and failed modules too: the settings page is where a bad config gets fixed. */
  schema?: z.ZodType;
  /** Where the module's slice sits in the config file: `[name]` for a public module, `['modules', name]` otherwise. */
  configPath: readonly string[];
};

/** What the startup learned about every module, filled by `createAppRouter` and `discoverModules`. */
export function createModuleStates() {
  const infos = new Map<string, ModuleInfo>();
  return {
    set: (info: ModuleInfo) => void infos.set(info.name, info),
    get: (name: string) => infos.get(name),
    list: () => [...infos.values()].toSorted((a, b) => a.name.localeCompare(b.name)),
  };
}
export type ModuleStates = ReturnType<typeof createModuleStates>;

/** A module whose config is absent, `z.undefined()` or `z.unknown()` (any slice, nothing to draw) has nothing to edit. */
export function configSchemaOf(config: z.ZodType | undefined) {
  const empty = config instanceof z.ZodUndefined || config instanceof z.ZodUnknown || config instanceof z.ZodAny;
  return config && !empty ? config : undefined;
}
