import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { guardModules } from './guard-modules.ts';

const script = fileURLToPath(new URL('./guard-modules.ts', import.meta.url));

function isolatedEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

void test('G10: guard-modules allows no-slash ignore and fails on tracked private screenshots', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-guard-modules-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const env = isolatedEnv();
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' });
  git('init', '--quiet');
  writeFileSync(join(dir, '.gitignore'), 'modules[.]local\n');
  git('add', '.gitignore');
  assert.deepEqual(guardModules(dir, false), []);
  assert.deepEqual(guardModules(dir, true), []);

  mkdirSync(join(dir, 'apps/e2e/__screenshots__/private'), { recursive: true });
  writeFileSync(join(dir, 'apps/e2e/__screenshots__/private/leak.png'), 'not-a-real-png');
  git('add', 'apps/e2e/__screenshots__/private/leak.png');

  const findings = guardModules(dir, false);
  assert.equal(findings.length, 1);
  assert.match(findings[0] ?? '', /Private snapshot under tracked directory/);

  const res = spawnSync(process.execPath, [script, '--staged'], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Private snapshot under tracked directory/);
});
