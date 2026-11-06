import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defaultModuleRoots } from '../apps/server/src/core/discovery.ts';

export function findPrivateE2eFolders(root: string) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'e2e')))
    .map((entry) => ({ name: entry.name, path: join(root, entry.name, 'e2e') }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

export function runPrivateE2e(folder: string) {
  const run = spawnSync('pnpm', ['--filter', '@hub/e2e', 'e2e', '--project=private'], {
    stdio: 'inherit',
    env: { ...process.env, HUB_E2E_PRIVATE: folder },
  });
  return run.status ?? 1;
}

if (import.meta.main) {
  const custom = process.env.HUB_E2E_PRIVATE;
  if (custom) {
    process.exitCode = runPrivateE2e(custom);
  } else {
    const root = process.env.HUB_MODULES_ROOT ?? defaultModuleRoots[0];
    const targets = findPrivateE2eFolders(root);
    const chosen = process.argv[2];
    if (chosen) {
      const match = targets.find((t) => t.name === chosen);
      if (!match) {
        process.stderr.write(`test:e2e:private: module "${chosen}" has no e2e/ folder\n`);
        process.exitCode = 1;
      } else {
        process.exitCode = runPrivateE2e(match.path);
      }
    } else if (targets.length === 0) {
      process.stdout.write('test:e2e:private: no private e2e folders found; skipping.\n');
      process.exitCode = 0;
    } else {
      for (const target of targets) {
        const code = runPrivateE2e(target.path);
        if (code !== 0) {
          process.exitCode = code;
          break;
        }
      }
    }
  }
}
