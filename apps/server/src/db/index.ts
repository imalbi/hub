import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';

const coreMigrations = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Opens a SQLite file (or ':memory:') and applies the migrations of `migrationsFolder` before anything reads it.
 * A migration that throws closes the handle again, so a failed open never leaves a file locked.
 */
export function openDatabase(path: string, migrationsFolder: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = drizzle(path);
  try {
    db.$client.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    migrate(db, { migrationsFolder });
  } catch (error) {
    db.$client.close();
    throw error;
  }
  return db;
}

/** The core database: devices, layouts, themes, Pomodoro history. */
export function openDb(path: string) {
  return openDatabase(path, coreMigrations);
}

/** A module keeps its file next to the core one; with an in-memory core (tests, e2e) it stays in memory too. */
export function moduleDbPath(corePath: string, name: string) {
  return corePath === ':memory:' ? corePath : join(dirname(corePath), 'modules', `${name}.db`);
}

export type Db = ReturnType<typeof openDb>;
