import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultModuleRoots } from '../apps/server/src/core/discovery.ts';

// Tests and typecheck of the private modules, which no workspace covers. Prints module names and counts only; the
// output of a failing run is the one thing shown in full, because it is what the author needs to fix it.
const repo = fileURLToPath(new URL('..', import.meta.url));
const tsc = join(repo, 'node_modules/.bin/tsc');
const prettier = join(repo, 'node_modules/.bin/prettier');
const baseConfig = join(repo, 'scripts/tsconfig.modules.json');

/** A module is a folder with a `server.ts`, the same rule discovery uses. */
function findModules(root: string) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'server.ts')))
    .map((entry) => entry.name)
    .toSorted();
}

function testFiles(folder: string) {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.test.ts') && !file.split('/').includes('node_modules'))
    .map((file) => join(folder, file));
}

function count(output: string, label: string) {
  return Number(new RegExp(`^# ${label} (\\d+)$`, 'm').exec(output)?.[1] ?? 0);
}

/** Runs one module; returns the failure output, or null with the counts it printed. */
function checkModule(root: string, name: string, scratch: string) {
  const folder = join(root, name);
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
  process.stdout.write(
    `check-modules: ${name}: ${tests} tests passed in ${files.length} files, typecheck and format ok\n`,
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

export function checkModules(root: string, only?: string, write = false) {
  const found = findModules(root);
  if (only && !found.includes(only)) {
    process.stderr.write(`check-modules: unknown module "${only}"; found: ${found.join(', ') || 'none'}\n`);
    return 1;
  }
  if (!found.length) {
    process.stdout.write('check-modules: no private modules\n');
    return 0;
  }
  const scratch = mkdtempSync(join(tmpdir(), 'hub-check-modules-'));
  try {
    let failed = 0;
    for (const name of only ? [only] : found) {
      if (write) {
        const result = formatModule(join(root, name), true);
        process.stdout.write(result.stdout);
        if (result.status !== 0) {
          process.stderr.write(result.stderr);
          failed++;
        }
        continue;
      }
      const failure = checkModule(root, name, scratch);
      if (failure === null) continue;
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
  process.exitCode = checkModules(process.env.HUB_MODULES_ROOT ?? defaultModuleRoots[0], args[write ? 1 : 0], write);
}
