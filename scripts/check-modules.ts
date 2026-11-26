import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  combineHashes,
  hashDirectory,
  hasPassStamp,
  stampsPath,
  worktreeTree,
  writePassStamp,
} from './verify-stamp.ts';
import { defaultModuleRoots } from '../apps/server/src/core/discovery.ts';

// Tests and typecheck of the private/installed modules, which no workspace covers. Prints module names and counts only;
// the output of a failing run is the one thing shown in full, because it is what the author needs to fix it.
const repo = fileURLToPath(new URL('..', import.meta.url));
const tsc = join(repo, 'node_modules/.bin/tsc');
const oxlint = join(repo, 'node_modules/.bin/oxlint');
const oxlintConfig = join(repo, '.oxlintrc.json');
const prettier = join(repo, 'node_modules/.bin/prettier');
const baseConfig = join(repo, 'scripts/tsconfig.modules.json');

/** A module is a folder with a `server.ts`, the same rule discovery uses. Earlier roots win on name collision. */
export function findModules(roots: string | readonly string[]) {
  const list = typeof roots === 'string' ? [roots] : roots;
  const seen = new Map<string, string>();
  for (const root of list) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(root, entry.name, 'server.ts')) && !seen.has(entry.name))
        seen.set(entry.name, join(root, entry.name));
    }
  }
  return [...seen.entries()]
    .map(([name, folder]) => ({ name, folder }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

function testFiles(folder: string) {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.test.ts') && !file.split(/[\\/]/).includes('node_modules'))
    .map((file) => join(folder, file));
}

function count(output: string, label: string) {
  return Number(new RegExp(`^# ${label} (\\d+)$`, 'm').exec(output)?.[1] ?? 0);
}

/** Runs one module; returns the failure output, or null with the counts it printed. */
function checkModule(folder: string, name: string, scratch: string) {
  const format = formatModule(folder, false);
  if (format.status !== 0) return `${format.stdout}${format.stderr}`;
  const files = testFiles(folder);
  let tests = 0;
  if (files.length) {
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (run.status !== 0) return `${run.stdout}${run.stderr}`;
    tests = count(run.stdout, 'tests');
  }
  const config = join(scratch, `${name}.json`);
  writeFileSync(
    config,
    JSON.stringify({
      extends: baseConfig,
      include: [`${folder}/**/*.ts`, `${folder}/**/*.tsx`],
      exclude: ['**/node_modules'],
    }),
  );
  const types = spawnSync(tsc, ['-p', config], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (types.status !== 0) return `${types.stdout}${types.stderr}`;
  const lintFiles = readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/u.test(file) && !file.split(/[\\/]/).includes('node_modules'))
    .map((file) => join(folder, file));
  const lint = spawnSync(
    oxlint,
    ['--type-aware', '--deny-warnings', '--config', oxlintConfig, '--tsconfig', config, ...lintFiles],
    { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (lint.status !== 0) return `${lint.stdout}${lint.stderr}`;
  process.stdout.write(
    `check-modules: ${name}: ${tests} tests passed in ${files.length} files, typecheck, lint and format ok\n`,
  );
  return null;
}

function formatModule(folder: string, write: boolean) {
  return spawnSync(
    prettier,
    [
      write ? '--write' : '--check',
      '--config',
      join(repo, '.prettierrc.json'),
      '--ignore-path',
      join(repo, '.prettierignore'),
      folder,
    ],
    { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
}

export function checkModules(roots: string | readonly string[], only?: string, write = false) {
  const found = findModules(roots);
  if (only && !found.some((entry) => entry.name === only)) {
    process.stderr.write(
      `check-modules: unknown module "${only}"; found: ${found.map((entry) => entry.name).join(', ') || 'none'}\n`,
    );
    return 1;
  }
  if (!found.length) {
    process.stdout.write('check-modules: no private modules\n');
    return 0;
  }
  const cache = !write && process.env.HUB_MODULES_ROOT === undefined && roots === defaultModuleRoots;
  const stamps = cache ? stampsPath() : undefined;
  const scratch = mkdtempSync(join(tmpdir(), 'hub-check-modules-'));
  try {
    let failed = 0;
    for (const { name, folder } of only ? found.filter((entry) => entry.name === only) : found) {
      if (write) {
        const result = formatModule(folder, true);
        process.stdout.write(result.stdout);
        if (result.status !== 0) {
          process.stderr.write(result.stderr);
          failed++;
        }
        continue;
      }
      const key = `check-module:${name}`;
      const startHash = cache ? combineHashes(worktreeTree(), hashDirectory(folder)) : undefined;
      if (stamps && startHash && hasPassStamp(stamps, key, startHash)) {
        process.stdout.write(`check-modules: ${name}: cached (unchanged)\n`);
        continue;
      }
      const failure = checkModule(folder, name, scratch);
      if (failure === null) {
        if (stamps && startHash) {
          const endHash = combineHashes(worktreeTree(), hashDirectory(folder));
          if (endHash === startHash) writePassStamp(stamps, key, startHash);
          else process.stderr.write(`check-modules: ${name}: inputs changed; stamp not written\n`);
        }
        continue;
      }
      failed++;
      process.stderr.write(`check-modules: ${name}: FAILED\n${failure}\n`);
    }
    return failed ? 1 : 0;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const write = args[0] === '--write';
  const roots = process.env.HUB_MODULES_ROOT !== undefined ? [process.env.HUB_MODULES_ROOT] : defaultModuleRoots;
  process.exitCode = checkModules(roots, args[write ? 1 : 0], write);
}
