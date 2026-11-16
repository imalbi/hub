import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { backup, type DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { agentOrLoopbackProcedure, router } from './trpc.ts';

const DATE_FOLDER = /^\d{4}-\d{2}-\d{2}$/;
const HOUR_MS = 3_600_000;
/** The only failure text an answer carries: a driver message or a path could leak the folder layout. */
const FAILED = 'Copia non riuscita';

/** The newest `keep` dated folders stay; folders not named as a date are never listed for removal. */
export function planPrune(names: readonly string[], keep: number) {
  return names
    .filter((name) => DATE_FOLDER.test(name))
    .toSorted()
    .toReversed()
    .slice(keep);
}

/** The local day, `YYYY-MM-DD`: a copy per calendar day of the owner, not per UTC day. */
export function localDate(at: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export type BackupState =
  | { status: 'off' }
  | { status: 'never' }
  | { status: 'ok'; at: number; date: string; copies: number; bytes: number }
  | { status: 'failed'; error: string };

type BackupOptions = {
  /** The core database path; `:memory:` turns the service off (tests, the e2e fake). */
  dbPath: string;
  /** The core database's open handle, copied as `hub.db`. */
  core?: DatabaseSync;
  enabled?: boolean;
  dir?: string;
  keep?: number;
  now?: () => Date;
};

/** Modules hand their open database over by name (`add`), so no file is ever opened a second time. */
export function createBackup({ dbPath, core, enabled = true, dir, keep = 14, now = () => new Date() }: BackupOptions) {
  const off = !enabled || dbPath === ':memory:';
  const folder = dir ?? join(dirname(dbPath), 'backups');
  const modules = new Map<string, DatabaseSync>();
  let running: Promise<BackupState> | undefined;
  let checking: Promise<void> | undefined;
  let failed = false;

  async function dates() {
    const names = await readdir(folder).catch(() => []);
    return names.filter((name) => DATE_FOLDER.test(name)).toSorted();
  }

  async function bytesOf(path: string): Promise<number> {
    let total = 0;
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      total += entry.isDirectory() ? await bytesOf(full) : (await stat(full)).size;
    }
    return total;
  }

  async function state(): Promise<BackupState> {
    if (off) return { status: 'off' };
    if (failed) return { status: 'failed', error: FAILED };
    const all = await dates();
    const newest = all.at(-1);
    if (!newest) return { status: 'never' };
    const path = join(folder, newest);
    return {
      status: 'ok',
      at: (await stat(path)).mtimeMs,
      date: newest,
      copies: all.length,
      bytes: await bytesOf(path),
    };
  }

  async function copy() {
    const date = localDate(now());
    const partial = join(folder, `${date}.partial`);
    try {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await rm(partial, { recursive: true, force: true });
      await mkdir(join(partial, 'modules'), { recursive: true, mode: 0o700 });
      if (core) await backup(core, join(partial, 'hub.db'));
      for (const [name, db] of modules) await backup(db, join(partial, 'modules', `${name}.db`));
      await rm(join(folder, date), { recursive: true, force: true });
      await rename(partial, join(folder, date));
      // Pruning comes after the new copy is in place: a failed run never costs an older one.
      for (const old of planPrune(await dates(), keep)) await rm(join(folder, old), { recursive: true, force: true });
      failed = false;
    } catch {
      failed = true;
      await rm(partial, { recursive: true, force: true }).catch(() => undefined);
    }
    return state();
  }

  /** A run while another is going answers with the one going. */
  function run() {
    if (off) return state();
    running ??= copy().finally(() => {
      running = undefined;
    });
    return running;
  }

  async function checkToday() {
    if (off || (await dates()).includes(localDate(now()))) return;
    await run();
  }

  return {
    add: (name: string, db: DatabaseSync) => void modules.set(name, db),
    state,
    run,
    /** Makes today's copy when there is none. */
    ensureToday() {
      checking = checkToday();
      return checking;
    },
    /** Waits for a check that may not have started its copy yet, then for the copy. */
    async close() {
      await checking;
      await running;
    },
  };
}
export type Backup = ReturnType<typeof createBackup>;

/** The real timer: unref'd so it never keeps the process alive; returns what stops it. */
const hourly = (task: () => Promise<void>) => {
  const timer = setInterval(() => void task(), HOUR_MS);
  timer.unref();
  return () => clearInterval(timer);
};

/** A check now and then every hour. `started` settles with the first check; `schedule` is injected by tests. */
export function startDailyCheck(service: Pick<Backup, 'ensureToday'>, schedule = hourly) {
  const started = service.ensureToday();
  return { started, stop: schedule(() => service.ensureToday()) };
}

export function createBackupRouter(service: Backup) {
  return router({
    state: agentOrLoopbackProcedure.query(() => service.state()),
    run: agentOrLoopbackProcedure
      .meta({ label: 'Esegui backup', description: 'Copy Hub databases to the backup folder now' })
      .output(z.custom<BackupState>())
      .mutation(() => service.run()),
  });
}
