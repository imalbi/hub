import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  combineHashes,
  hashDirectory,
  hasPassStamp,
  hubPrivateRuntimeHash,
  stampsPath,
  writePassStamp,
} from './verify-stamp.ts';
import { defaultModuleRoots } from '../apps/server/src/core/discovery.ts';

export function findPrivateE2eFolders(roots: string | readonly string[]) {
  const list = typeof roots === 'string' ? [roots] : roots;
  const seen = new Map<string, string>();
  for (const root of list) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const e2ePath = join(root, entry.name, 'e2e');
      if (entry.isDirectory() && existsSync(e2ePath) && !seen.has(entry.name)) seen.set(entry.name, e2ePath);
    }
  }
  return [...seen.entries()].map(([name, path]) => ({ name, path })).toSorted((a, b) => a.name.localeCompare(b.name));
}

export function privateE2eStampKey(name: string, skipVisual: boolean) {
  return `e2e:private-${name}${skipVisual ? ':novisual' : ''}`;
}

export function privateE2eInputHash(moduleDir: string, skipVisual: boolean, cwd = process.cwd()) {
  return combineHashes(hubPrivateRuntimeHash(cwd), hashDirectory(moduleDir), skipVisual ? 'novisual' : 'visual');
}

export function runPrivateE2e(folder: string) {
  const cache = process.env.HUB_MODULES_ROOT === undefined;
  const skipVisual = process.env.HUB_E2E_SKIP_VISUAL === '1';
  const moduleDir = dirname(folder);
  const key = privateE2eStampKey(basename(moduleDir), skipVisual);
  const stamps = cache ? stampsPath() : undefined;
  const startHash = cache ? privateE2eInputHash(moduleDir, skipVisual) : undefined;
  if (stamps && startHash && hasPassStamp(stamps, key, startHash)) {
    process.stdout.write(`e2e: private-${basename(moduleDir)} skipped (cached)\n`);
    return 0;
  }
  const run = spawnSync('pnpm', ['--filter', '@hub/e2e', 'e2e', '--project=private'], {
    stdio: 'inherit',
    env: { ...process.env, HUB_E2E_PRIVATE: folder },
  });
  const code = run.status ?? 1;
  if (code === 0 && stamps && startHash) {
    if (privateE2eInputHash(moduleDir, skipVisual) === startHash) writePassStamp(stamps, key, startHash);
    else process.stderr.write(`e2e: private-${basename(moduleDir)} inputs changed; stamp not written\n`);
  }
  return code;
}

if (import.meta.main) {
  const custom = process.env.HUB_E2E_PRIVATE;
  if (custom) {
    process.exitCode = runPrivateE2e(custom);
  } else {
    const roots = process.env.HUB_MODULES_ROOT ? [process.env.HUB_MODULES_ROOT] : defaultModuleRoots;
    const targets = findPrivateE2eFolders(roots);
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
