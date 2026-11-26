import { spawnSync } from 'node:child_process';
import { defaultModuleRoots } from '../apps/server/src/core/discovery.ts';
import { findModules } from './check-modules.ts';
import {
  combineHashes,
  hashDirectory,
  hasPassStamp,
  stampsPath,
  worktreeTree,
  writePassStamp,
} from './verify-stamp.ts';

export function checkInputHash() {
  return combineHashes(
    worktreeTree(),
    ...findModules(defaultModuleRoots).map(({ name, folder }) => combineHashes(name, hashDirectory(folder))),
  );
}

export function checkCacheEnabled() {
  return process.env.HUB_MODULES_ROOT === undefined && process.env.HUB_GUARD_STAGED !== '1';
}

export function runCheck() {
  const cache = checkCacheEnabled();
  const stamps = cache ? stampsPath() : undefined;
  const startHash = cache ? checkInputHash() : undefined;
  if (stamps && startHash && hasPassStamp(stamps, 'check', startHash)) {
    process.stdout.write('check: skipped (cached)\n');
    return 0;
  }
  for (const step of ['guard', 'typecheck', 'check:modules', 'lint', 'format:check', 'test']) {
    const code = spawnSync('pnpm', [step], { stdio: 'inherit' }).status ?? 1;
    if (code !== 0) return code;
  }
  if (stamps && startHash) {
    if (checkInputHash() === startHash) writePassStamp(stamps, 'check', startHash);
    else process.stderr.write('check: inputs changed; stamp not written\n');
  }
  return 0;
}

if (import.meta.main) process.exitCode = runCheck();
