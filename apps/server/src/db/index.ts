import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Opens the SQLite file (or ':memory:') and applies pending migrations before anything reads it. */
export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = drizzle(path);
  db.$client.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  migrate(db, { migrationsFolder });
  return db;
}

export type Db = ReturnType<typeof openDb>;
