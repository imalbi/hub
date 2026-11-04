import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.ts';
import { buildServer } from './server.ts';

// XDG state dir: personal data stays out of the repo and survives reinstalls of it.
const dbPath = process.env.HUB_DB ?? join(homedir(), '.local/state/hub/hub.db');

// Loopback only until the deck gets token auth (phase 1).
await buildServer({ dbPath, config: loadConfig() }).listen({
  host: '127.0.0.1',
  port: Number(process.env.HUB_PORT ?? 4180),
});
