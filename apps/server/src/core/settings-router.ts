import { chmod, copyFile, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { configSchema } from './config.ts';
import type { ModuleInfo, ModuleStates } from './module-states.ts';
import { formSchema, getAt, isObject, redact, restoreSecrets, secretPaths, setAt } from './settings-config.ts';
import { loopbackProcedure, protectedProcedure, router } from './trpc.ts';

/** Exit code that asks the service manager for a new start (`Restart=on-failure` restarts on any non-zero code). */
export const RESTART_EXIT_CODE = 75;

const notFound = () => new TRPCError({ code: 'NOT_FOUND', message: 'No such module' });

async function readFileText(path: string) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The config file as plain JSON; a missing file is an empty config, an unreadable one is refused. */
async function readConfigJson(path: string): Promise<Record<string, unknown>> {
  const text = await readFileText(path);
  if (text === undefined) return {};
  try {
    const json: unknown = JSON.parse(text);
    if (isObject(json)) return json;
  } catch {
    // Falls through to the same refusal.
  }
  throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'The config file is not valid JSON' });
}

/** Copy the current file to `<path>.bak`, write a temporary file next to it and rename it over the original. */
async function writeConfigSafely(path: string, text: string) {
  const current = await stat(path).catch(() => undefined);
  if (current) await copyFile(path, `${path}.bak`);
  const temporary = `${path}.tmp-${process.pid}`;
  // Secrets live in this file: keep its permissions, or owner-only for a new one.
  await writeFile(temporary, text, { mode: current?.mode ?? 0o600 });
  if (current) await chmod(temporary, current.mode);
  await rename(temporary, path);
}

const issueList = (error: z.ZodError, info: ModuleInfo) =>
  error.issues.map(({ path, message }) => {
    const full = path.map(String);
    // Relative to the module's own slice, which is what the form shows.
    const inside = info.configPath.every((key, index) => full[index] === key);
    return { path: inside ? full.slice(info.configPath.length) : full, message };
  });

/**
 * Impostazioni. The PC only, reads included: the deck could otherwise read personal values (site URLs, mail accounts,
 * the job profile) over the LAN. A save validates against the full config schema before touching the file.
 */
export function createSettingsRouter({ states, configPath }: { states: ModuleStates; configPath?: string }) {
  const requirePath = () => {
    if (!configPath) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No config file is set up' });
    return configPath;
  };
  const known = (name: string) => {
    const info = states.get(name);
    if (!info) throw notFound();
    return info;
  };

  return router({
    modules: loopbackProcedure.query(() =>
      states.list().map(({ name, kind, status, schema }) => ({ name, kind, status, hasConfig: schema !== undefined })),
    ),

    /** One module's JSON Schema and its stored value, with every secret replaced by `{ set: true }` (or absent). */
    config: loopbackProcedure.input(z.object({ module: z.string() })).query(async ({ input }) => {
      const info = known(input.module);
      const path = requirePath();
      const paths = info.schema ? secretPaths(info.schema) : [];
      const file = await readConfigJson(path);
      return {
        schema: info.schema ? formSchema(info.schema) : null,
        value: redact(getAt(file, info.configPath), paths),
        secrets: paths,
        hasBackup: (await stat(`${path}.bak`).catch(() => undefined)) !== undefined,
      };
    }),

    save: loopbackProcedure
      .meta({
        label: 'Salva impostazioni',
        description: "Save one module's settings and its on/off switch, then restart Hub",
      })
      .input(z.object({ module: z.string(), enabled: z.boolean(), value: z.unknown().optional() }))
      .mutation(async ({ ctx, input }) => {
        const info = known(input.module);
        const path = requirePath();
        const file = await readConfigJson(path);
        let next = file;
        if (input.value !== undefined && info.schema) {
          const paths = secretPaths(info.schema);
          next = setAt(file, info.configPath, restoreSecrets(input.value, getAt(file, info.configPath), paths));
        }
        const off = new Set(Array.isArray(next.modulesOff) ? next.modulesOff.map(String) : []);
        if (input.enabled) off.delete(info.name);
        else off.add(info.name);
        next = off.size > 0 || 'modulesOff' in next ? { ...next, modulesOff: [...off].toSorted() } : next;

        const errors: Array<z.ZodError | undefined> = [configSchema.safeParse(next).error];
        // A discovered module's slice is a free record in the core schema: its own schema checks it.
        if (info.kind === 'private' && info.schema)
          errors.push(info.schema.safeParse(getAt(next, info.configPath)).error);
        const issues = errors.flatMap((error) => (error ? issueList(error, info) : []));
        if (issues.length > 0) return { ok: false as const, issues };

        await writeConfigSafely(path, `${JSON.stringify(next, null, 2)}\n`);
        return { ok: true as const, restarting: ctx.restart() };
      }),

    /** Swap the config file with `<file>.bak` (the version before the last save), then restart. */
    restore: loopbackProcedure
      .meta({
        label: 'Ripristina impostazioni',
        description: 'Replace the config file with the version saved before the last change, then restart Hub',
        danger: true,
      })
      .input(z.object({ confirmed: z.literal(true) }))
      .mutation(async ({ ctx }) => {
        const backup = configPath && (await readFileText(`${configPath}.bak`));
        if (!configPath || backup === undefined)
          throw new TRPCError({ code: 'NOT_FOUND', message: 'There is no previous version' });
        // A backup the server cannot start with (a broken hand edit) would leave the service failing on every restart.
        if (!configSchema.safeParse(parseJson(backup)).success)
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'The previous version is not a valid config' });
        await writeConfigSafely(configPath, backup);
        return { restarting: ctx.restart() };
      }),
  });
}

export function createEnabledRouter(states: ModuleStates) {
  return router({
    enabled: protectedProcedure.query(() =>
      states
        .list()
        .filter(({ status }) => status === 'on')
        .map(({ name }) => name),
    ),
  });
}
