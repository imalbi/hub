import { readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { moduleDbPath, openDatabase, type Db } from '../db/index.ts';
import { router } from './trpc.ts';
import type { DiscoveredDeps, ModuleInstance } from './module.ts';
import { configSchemaOf, type ModuleInfo, type ModuleStates } from './module-states.ts';

// Only this server discovery point may load private source paths.
const privateRoot = fileURLToPath(new URL('../../../../modules.local/', import.meta.url)); // guard-private: allow Private module discovery
export const defaultModuleRoots = [privateRoot];
const exampleRoot = fileURLToPath(new URL('../../../../modules.example/', import.meta.url));
const name = z
  .string()
  .regex(/^[a-z][a-z\d-]{0,39}$/)
  .refine((value) => !['then', '__proto__', 'constructor', 'prototype'].includes(value));
// `db` is the module's own database, present only when it declared `migrations`; never the core one.
type DiscoveredCreate = (deps: DiscoveredDeps & { db?: Db; config: unknown }) => ModuleInstance;
const definitionSchema = z.object({
  name,
  config: z.custom<z.ZodType>((value) => value instanceof z.ZodType).optional(),
  settingsSchema: z.custom<z.ZodType>((value) => value instanceof z.ZodType).optional(),
  zones: z.array(name).optional(),
  // A relative path would resolve against the server's working directory.
  migrations: z.string().refine(isAbsolute).optional(),
  // Public modules only: a discovered module asking for the core database is refused, not served.
  coreDb: z.never().optional(),
  create: z.custom<DiscoveredCreate>((value) => typeof value === 'function'),
});
const instanceSchema = z.object({
  // tRPC validates the exact record when composing it; reject non-router exports here too.
  router: z.custom<ModuleInstance['router']>(
    (value) => typeof value === 'object' && value !== null && '_def' in value && 'createCaller' in value,
  ),
  close: z.custom<NonNullable<ModuleInstance['close']>>((value) => typeof value === 'function').optional(),
});

export async function discoverModules({
  roots = [privateRoot],
  examples = false,
  onlyModules,
  reserved,
  deps,
  dbPath,
  config,
  onClose,
  states,
  off = [],
}: {
  roots?: readonly string[];
  examples?: boolean;
  /** Folder names to load; unset loads every folder. Only tests set it, so a broken sibling module cannot fail them. */
  onlyModules?: readonly string[];
  reserved: readonly string[];
  deps: DiscoveredDeps;
  /** The core database path: module databases live next to it. */
  dbPath: string;
  config: Record<string, unknown>;
  onClose: (close: NonNullable<ModuleInstance['close']>) => void;
  /** Receives one entry per module found: on, off (named in `off`, never created) or failed. */
  states?: ModuleStates;
  off?: readonly string[];
}) {
  const routers: Record<string, ModuleInstance['router']> = {};
  const names = new Set(reserved);
  for (const root of [...roots, ...(examples ? [exampleRoot] : [])]) {
    const folders = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
        deps.log.warn('Module directory could not be read');
      return [];
    });
    for (const folder of folders
      // Only folders that can be module names: the private root may hold its own `.git` and other tool folders.
      .filter((entry) => entry.isDirectory() && name.safeParse(entry.name).success)
      .filter((entry) => !onlyModules || onlyModules.includes(entry.name))
      .toSorted((a, b) => a.name.localeCompare(b.name))) {
      let close: ModuleInstance['close'];
      let db: Db | undefined;
      // Filled as soon as the definition parses, so a module that fails later still has its schema in settings.
      let info: Omit<ModuleInfo, 'status'> | undefined;
      try {
        const imported: unknown = await import(pathToFileURL(join(root, folder.name, 'server.ts')).href);
        const { default: definition } = z.object({ default: definitionSchema }).parse(imported);
        if (names.has(definition.name)) throw new Error('Duplicate module name');
        info = {
          name: definition.name,
          kind: 'private',
          schema: configSchemaOf(definition.settingsSchema ?? definition.config),
          configPath: ['modules', definition.name],
        };
        // Importing reads the definition only; `create` (database, timers, routes) never runs for an off module.
        if (off.includes(definition.name)) {
          states?.set({ ...info, status: 'off' });
          continue;
        }
        if (definition.zones?.some((zone) => deps.zones.has(zone))) throw new Error('Duplicate desk zone');
        if (definition.migrations) db = openDatabase(moduleDbPath(dbPath, definition.name), definition.migrations);
        const instance = definition.create({
          ...deps,
          ...(db && { db }),
          config: definition.config?.parse(config[definition.name]),
        });
        close = typeof instance.close === 'function' ? instance.close : undefined;
        const parsed = instanceSchema.parse(instance);
        router({ [definition.name]: parsed.router });
        routers[definition.name] = parsed.router;
        names.add(definition.name);
        states?.set({ ...info, status: 'on' });
        for (const zone of definition.zones ?? []) deps.zones.add(zone);
        // Fastify runs onClose hooks last in, first out: the database goes first in so it closes after the module's
        // own cleanup, which may still write.
        const own = db;
        if (own) onClose(() => own.$client.close());
        if (parsed.close) onClose(parsed.close);
      } catch {
        try {
          await close?.();
        } catch {
          deps.log.warn('Skipped module cleanup failed');
        }
        db?.$client.close();
        // A name a live module already owns (a collision) keeps its own entry; the log carries the folder only.
        const failedName = info?.name ?? folder.name;
        if (!states?.get(failedName))
          states?.set({
            kind: 'private',
            configPath: ['modules', failedName],
            ...info,
            name: failedName,
            status: 'failed',
          });
        // Import/config errors can contain personal source or values; do not log their payloads.
        deps.log.warn({ module: folder.name }, 'Module skipped: invalid definition, configuration or factory');
      }
    }
  }
  return routers;
}
