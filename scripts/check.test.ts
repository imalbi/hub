import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { readPassStamps } from './verify-stamp.ts';

function fixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'hub-check-cache-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'scripts'));
  mkdirSync(join(dir, 'apps/server/src/core'), { recursive: true });
  mkdirSync(join(dir, 'ignored/module'), { recursive: true });
  mkdirSync(join(dir, 'bin'));
  for (const name of ['check.ts', 'verify-stamp.ts'])
    copyFileSync(new URL(name, import.meta.url), join(dir, 'scripts', name));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, '.gitignore'), 'ignored/\nbin/\ncommands\n');
  writeFileSync(join(dir, 'apps/server/src/core/discovery.ts'), "export const defaultModuleRoots = ['ignored'];\n");
  writeFileSync(
    join(dir, 'scripts/check-modules.ts'),
    "export function findModules() { return [{ name: 'module', folder: 'ignored/module' }]; }\n",
  );
  writeFileSync(join(dir, 'ignored/module/server.ts'), 'first');
  const pnpm = join(dir, 'bin/pnpm');
  writeFileSync(
    pnpm,
    '#!/usr/bin/env node\n' +
      `
import { appendFileSync, writeFileSync } from 'node:fs';
const step = process.argv[2];
appendFileSync('commands', step + '\\n');
if (step === 'test' && process.env.DRIFT) writeFileSync('ignored/module/server.ts', 'drift');
if (step === process.env.FAIL_STEP) process.exit(7);
`,
  );
  chmodSync(pnpm, 0o755);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  execFileSync('git', ['init', '--quiet'], { cwd: dir, env });
  const run = (extra: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, ['scripts/check.ts'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, HUB_VERIFY_NO_CACHE: '0', ...extra },
    });
  return {
    dir,
    run,
    stamps: join(dir, '.git/hub-pass-stamps.json'),
    commands: () => readFileSync(join(dir, 'commands'), 'utf8').trim().split('\n'),
  };
}

void test('check runs all six gates, reuses green results and invalidates after a module edit', (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  assert.deepEqual(f.commands(), ['guard', 'typecheck', 'check:modules', 'lint', 'format:check', 'test']);
  const cached = f.run();
  assert.equal(cached.status, 0);
  assert.match(cached.stdout, /skipped \(cached\)/);
  assert.equal(f.commands().length, 6);
  writeFileSync(join(f.dir, 'ignored/module/server.ts'), 'edited');
  assert.equal(f.run().status, 0);
  assert.equal(f.commands().length, 12);
  assert.equal(f.run({ HUB_VERIFY_NO_CACHE: '1' }).status, 0);
  assert.equal(f.commands().length, 18);
});

void test('check rejects drift and failed gates without stamping', (t) => {
  const f = fixture(t);
  const drift = f.run({ DRIFT: '1' });
  assert.equal(drift.status, 0);
  assert.match(drift.stderr, /inputs changed/);
  assert.deepEqual(readPassStamps(f.stamps), {});
  assert.equal(f.run({ FAIL_STEP: 'typecheck' }).status, 7);
  assert.deepEqual(readPassStamps(f.stamps), {});
  assert.deepEqual(f.commands().slice(-2), ['guard', 'typecheck']);
});

void test('custom module roots and staged guards always run the gates without caching', (t) => {
  const f = fixture(t);
  for (const env of [{ HUB_MODULES_ROOT: f.dir }, { HUB_GUARD_STAGED: '1' }]) {
    assert.equal(f.run(env).status, 0);
    assert.equal(f.run(env).status, 0);
    assert.deepEqual(readPassStamps(f.stamps), {});
  }
  assert.equal(f.commands().length, 24);
});
