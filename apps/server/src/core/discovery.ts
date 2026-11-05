import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { router } from './trpc.ts';
import type { ModuleDefinition, ModuleDeps, ModuleInstance } from './module.ts';

// Only this server discovery point may load private source paths.
const privateRoot = fileURLToPath(new URL('../../../../modules.local/', import.meta.url)); // guard-private: allow Private module discovery
export const defaultModuleRoots = [privateRoot];
const exampleRoot = fileURLToPath(new URL('../../../../modules.example/', import.meta.url));
const name = z
  .string()
  .regex(/^[a-z][a-z\d-]{0,39}$/)
  .refine((value) => !['then', '__proto__', 'constructor', 'prototype'].includes(value));
const definitionSchema = z.object({
  name,
  config: z.custom<z.ZodType>((value) => value instanceof z.ZodType).optional(),
  zones: z.array(name).optional(),
  create: z.custom<ModuleDefinition['create']>((value) => typeof value === 'function'),
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
  reserved,
  deps,
  config,
  onClose,
}: {
  roots?: readonly string[];
  examples?: boolean;
  reserved: readonly string[];
  deps: ModuleDeps;
  config: Record<string, unknown>;
  onClose: (close: NonNullable<ModuleInstance['close']>) => void;
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
      .filter((entry) => entry.isDirectory())
      .toSorted((a, b) => a.name.localeCompare(b.name))) {
      let close: ModuleInstance['close'];
      try {
        const imported: unknown = await import(pathToFileURL(join(root, folder.name, 'server.ts')).href);
        const { default: definition } = z.object({ default: definitionSchema }).parse(imported);
        if (names.has(definition.name)) throw new Error('Duplicate module name');
        if (definition.zones?.some((zone) => deps.zones.has(zone))) throw new Error('Duplicate desk zone');
        const instance = definition.create({ ...deps, config: definition.config?.parse(config[definition.name]) });
        close = typeof instance.close === 'function' ? instance.close : undefined;
        const parsed = instanceSchema.parse(instance);
        router({ [definition.name]: parsed.router });
        routers[definition.name] = parsed.router;
        names.add(definition.name);
        for (const zone of definition.zones ?? []) deps.zones.add(zone);
        if (parsed.close) onClose(parsed.close);
      } catch {
        try {
          await close?.();
        } catch {
          deps.log.warn('Skipped module cleanup failed');
        }
        // Import/config errors can contain personal source or values; do not log their payloads.
        deps.log.warn({ module: folder.name }, 'Module skipped: invalid definition, configuration or factory');
      }
    }
  }
  return routers;
}
