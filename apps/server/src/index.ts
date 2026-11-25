import { defaultModuleRoots } from './core/discovery.ts';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCanListen, configFilePath, loadConfig } from './core/config.ts';
import { RESTART_EXIT_CODE } from './core/settings-router.ts';
import { createShutdown } from './core/shutdown.ts';
import { buildServer } from './server.ts';

// XDG state dir: personal data stays out of the repo and survives reinstalls of it.
const dbPath = process.env.HUB_DB ?? join(homedir(), '.local/state/hub/hub.db');

// Served only when it has been built (`pnpm serve`); in dev the web app comes from Vite.
const dist = fileURLToPath(new URL('../../web/dist', import.meta.url));
const webRoot = existsSync(join(dist, 'index.html')) ? dist : undefined;

const loaded = loadConfig();
// Caelestia's own state file; the theme stays off when it does not exist.
const config = {
  ...loaded,
  theme: { caelestiaScheme: loaded.theme.caelestiaScheme ?? join(homedir(), '.local/state/caelestia/scheme.json') },
};
assertCanListen(config);

// Loopback unless the config opens it, and then only with an origin allowlist and device pairing in place.
const app = buildServer({
  dbPath,
  config,
  webRoot,
  moduleRoots: defaultModuleRoots,
  autoBackup: true,
  // Under systemd (`INVOCATION_ID`) a save exits and `hub.service` (`Restart=on-failure`) starts it again, any non-zero
  // code does. From a terminal (`pnpm dev`, `pnpm serve`) nobody would start it again: it only writes the file.
  settings: {
    configPath: configFilePath(),
    // Closing first runs every module's cleanup: a running Lavoro collection is cancelled and recorded, not killed.
    onRestart: process.env.INVOCATION_ID ? () => shutdown(RESTART_EXIT_CODE) : undefined,
  },
});
const shutdown = createShutdown(
  () => app.close(),
  (error) => app.log.error(error, 'Shutdown failed'),
);
process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());

await app.listen({
  host: config.server.host,
  port: Number(process.env.HUB_PORT ?? 4180),
});
