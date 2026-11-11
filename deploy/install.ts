import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveNode, runInstaller } from './installer.ts';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  process.stdout.write(
    'Usage: pnpm desktop:install [--apply] [--uninstall]\nWithout --apply, only show the planned changes.\n',
  );
} else if (args.some((arg) => arg !== '--apply' && arg !== '--uninstall')) {
  process.stderr.write('Unknown option. Use --help.\n');
  process.exitCode = 1;
} else {
  try {
    const repo = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
    const templates = {
      music: readFileSync(new URL('./hub-music.service', import.meta.url), 'utf8'),
      service: readFileSync(new URL('./hub.service', import.meta.url), 'utf8'),
      hyprland: readFileSync(new URL('./hypr-hub.lua', import.meta.url), 'utf8'),
      toggle: readFileSync(new URL('./caelestia-toggle.json', import.meta.url), 'utf8'),
    };
    process.stdout.write(
      runInstaller({
        repo,
        node: resolveNode(process.execPath),
        templates,
        configDir: process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
        stateDir: join(process.env.XDG_STATE_HOME ?? join(homedir(), '.local/state'), 'hub'),
        apply: args.includes('--apply'),
        uninstall: args.includes('--uninstall'),
      }) + '\n',
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Desktop installation failed'}\n`);
    process.exitCode = 1;
  }
}
