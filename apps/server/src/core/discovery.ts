import { readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { moduleDbPath, openDatabase, type Db } from '../db/index.ts';
import type { TrackJobFn } from './jobs.ts';
import { noopTrackJob } from './module.ts';
import { createCapabilityRegistry } from './capabilities.ts';
import { router } from './trpc.ts';
import type { DiscoveredDeps, ModuleInstance } from './module.ts';
import { configSchemaOf, type ModuleInfo, type ModuleStates } from './module-states.ts';

// Only this server discovery point may load private or installed module source paths.
export const privateRoot = fileURLToPath(new URL('../../../../modules.local/', import.meta.url)); // guard-private: allow Private module discovery
export const installedRoot = fileURLToPath(new URL('../../../../modules.installed/', import.meta.url));
export const reposRoot = fileURLToPath(new URL('../../../../modules.repos/', import.meta.url));
export const defaultModuleRoots = [privateRoot, installedRoot] as const;
const exampleRoot = fileURLToPath(new URL('../../../../modules.example/', import.meta.url));
export const moduleNameSchema = z
  .string()
  .regex(/^[a-z][a-z\d-]{0,39}$/)
  .refine((value) => !['then', 'call', 'apply', '__proto__', 'constructor', 'prototype'].includes(value));

export function resolveModuleRoots(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  return env.HUB_MODULES_ROOT ? [env.HUB_MODULES_ROOT] : defaultModuleRoots;
}

// `db` is the module's own database, present only when it declared `migrations`; never the core one.
type DiscoveredCreate = (deps: DiscoveredDeps & { db?: Db; config: unknown }) => ModuleInstance;
const definitionSchema = z.object({
  name: moduleNameSchema,
  config: z.custom<z.ZodType>((value) => value instanceof z.ZodType).optional(),
  settingsSchema: z.custom<z.ZodType>((value) => value instanceof z.ZodType).optional(),
  zones: z.array(moduleNameSchema).optional(),
  provides: z.array(moduleNameSchema).optional(),
  requires: z.array(moduleNameSchema).optional(),
  optional: z.record(moduleNameSchema, z.string().min(1)).optional(),
  setupNote: z.custom<NonNullable<ModuleInfo['setupNote']>>((value) => typeof value === 'function').optional(),
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
  routes: z.custom<NonNullable<ModuleInstance['routes']>>((value) => typeof value === 'function').optional(),
  close: z.custom<NonNullable<ModuleInstance['close']>>((value) => typeof value === 'function').optional(),
});

export async function discoverModules({
  roots = defaultModuleRoots,
  examples = false,
  onlyModules,
  reserved,
  deps,
  dbPath,
  config,
  onClose,
  states,
  off = [],
  onDb,
  onRoutes,
  available = [],
}: {
  roots?: readonly string[];
  examples?: boolean;
  /** Folder names to load; unset loads every folder. Only tests set it, so a broken sibling module cannot fail them. */
  onlyModules?: readonly string[];
  reserved: readonly string[];
  deps: Omit<DiscoveredDeps, 'trackJob'> & { trackJob?: TrackJobFn };
  /** The core database path: module databases live next to it. */
  dbPath: string;
  config: Record<string, unknown>;
  onClose: (close: NonNullable<ModuleInstance['close']>) => void;
  /** Receives one entry per module found: on, off (named in `off`, never created) or failed. */
  states?: ModuleStates;
  off?: readonly string[];
  /** Gets each discovered module's own open database (never the core one) with its name. */
  onDb?: (name: string, db: DatabaseSync) => void;
  onRoutes?: (name: string, routes: NonNullable<ModuleInstance['routes']>) => void;
  available?: readonly string[];
}) {
  const routers: Record<string, ModuleInstance['router']> = {};
  const names = new Set(reserved);
  const folderNames = new Set<string>();
  type Candidate = {
    folder: string;
    definition: z.infer<typeof definitionSchema>;
    info: Omit<ModuleInfo, 'status'>;
  };
  const candidates: Candidate[] = [];
  function fail(folder: string, info?: Omit<ModuleInfo, 'status'>) {
    const name = info?.name ?? folder;
    if (!states?.get(name))
      states?.set({ kind: 'private', configPath: ['modules', name], ...info, name, status: 'failed' });
    // Import/config errors can contain personal source or values; log only the folder.
    deps.log.warn({ module: folder }, 'Module skipped: invalid definition, configuration or factory');
  }
  for (const root of [...roots, ...(examples ? [exampleRoot] : [])]) {
    const folders = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
        deps.log.warn('Module directory could not be read');
      return [];
    });
    for (const folder of folders
      // Only folders that can be module names: the private root may hold its own `.git` and other tool folders.
      .filter((entry) => entry.isDirectory() && moduleNameSchema.safeParse(entry.name).success)
      .filter((entry) => !onlyModules || onlyModules.includes(entry.name))
      .toSorted((a, b) => a.name.localeCompare(b.name))) {
      // Filled as soon as the definition parses, so a module that fails later still has its schema in settings.
      let info: Omit<ModuleInfo, 'status'> | undefined;
      try {
        // Earlier roots own their folders even when import, configuration or creation fails.
        if (folderNames.has(folder.name)) throw new Error('Duplicate module folder');
        folderNames.add(folder.name);
        const imported: unknown = await import(pathToFileURL(join(root, folder.name, 'server.ts')).href);
        const { default: definition } = z.object({ default: definitionSchema }).parse(imported);
        if (names.has(definition.name)) throw new Error('Duplicate module name');
        names.add(definition.name);
        info = {
          name: definition.name,
          kind: 'private',
          schema: configSchemaOf(definition.settingsSchema ?? definition.config),
          configPath: ['modules', definition.name],
          setupNote: definition.setupNote,
        };
        // Importing reads the definition only; `create` (database, timers, routes) never runs for an off module.
        if (off.includes(definition.name)) {
          states?.set({ ...info, status: 'off' });
          continue;
        }
        candidates.push({ folder: folder.name, definition, info });
      } catch {
        fail(folder.name, info);
      }
    }
  }

  const live = new Set(available);
  const visiting = new Set<string>();
  const finished = new Set<string>();
  const provider = (name: string) =>
    candidates.find((candidate) => candidate.definition.name === name) ??
    candidates.find((candidate) => candidate.definition.provides?.includes(name));
  const satisfied = (name: string) => live.has(name) || deps.capabilities.has(name);

  function dependsOn(candidate: Candidate, name: string, seen = new Set<string>()): boolean {
    if (candidate.definition.name === name) return true;
    if (seen.has(candidate.definition.name)) return false;
    seen.add(candidate.definition.name);
    return (candidate.definition.requires ?? []).some((required) => {
      const dependency = provider(required);
      return dependency ? dependsOn(dependency, name, seen) : false;
    });
  }

  async function initialize(candidate: Candidate): Promise<boolean> {
    const { definition, info, folder } = candidate;
    if (finished.has(definition.name)) return live.has(definition.name);
    if (visiting.has(definition.name)) return false;
    visiting.add(definition.name);
    let close: ModuleInstance['close'];
    let db: Db | undefined;
    try {
      for (const name of definition.requires ?? []) {
        if (!satisfied(name)) {
          const dependency = provider(name);
          if (!dependency || !(await initialize(dependency)) || !satisfied(name))
            throw new Error('Missing or cyclic module dependency');
        }
      }
      for (const name of Object.keys(definition.optional ?? {})) {
        const dependency = provider(name);
        // An optional edge never makes an otherwise valid hard dependency cycle.
        if (dependency && !dependsOn(dependency, definition.name)) await initialize(dependency);
      }
      const capabilities = createCapabilityRegistry(deps.capabilities);
      if (definition.provides?.some((name) => deps.capabilities.has(name)))
        throw new Error('Duplicate capability provider');
      if (definition.zones?.some((zone) => deps.zones.has(zone))) throw new Error('Duplicate desk zone');
      if (definition.migrations) db = openDatabase(moduleDbPath(dbPath, definition.name), definition.migrations);
      const instance = definition.create({
        ...deps,
        capabilities,
        trackJob: deps.trackJob ?? noopTrackJob,
        ...(db && { db }),
        config: definition.config?.parse(config[definition.name]),
      });
      close = typeof instance.close === 'function' ? instance.close : undefined;
      const parsed = instanceSchema.parse(instance);
      router({ [definition.name]: parsed.router });
      for (const name of definition.provides ?? [])
        if (!capabilities.has(name)) throw new Error('Declared capability was not registered');
      for (const name of capabilities.list())
        if (!deps.capabilities.has(name)) deps.capabilities.register(name, capabilities.get(name));
      if (parsed.routes) onRoutes?.(definition.name, parsed.routes);
      routers[definition.name] = parsed.router;
      live.add(definition.name);
      states?.set({ ...info, status: 'on' });
      for (const zone of definition.zones ?? []) deps.zones.add(zone);
      // Fastify runs onClose hooks last in, first out: the database goes first in so it closes after the module's
      // own cleanup, which may still write.
      const own = db;
      if (own) {
        onDb?.(definition.name, own.$client);
        onClose(() => own.$client.close());
      }
      if (parsed.close) onClose(parsed.close);
    } catch {
      try {
        await close?.();
      } catch {
        deps.log.warn('Skipped module cleanup failed');
      }
      db?.$client.close();
      fail(folder, info);
    } finally {
      visiting.delete(definition.name);
      finished.add(definition.name);
    }
    return live.has(definition.name);
  }

  for (const candidate of candidates) await initialize(candidate);
  return routers;
}
