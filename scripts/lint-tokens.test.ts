import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { lintTokens } from './lint-tokens.ts';

const script = fileURLToPath(new URL('./lint-tokens.ts', import.meta.url));

void test('G6: lint-tokens detects arbitrary Tailwind values and font-mono without rg, ignoring paraglide and components/ui', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-tokens-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  mkdirSync(join(dir, 'src/paraglide'), { recursive: true });
  mkdirSync(join(dir, 'src/components/ui'), { recursive: true });

  writeFileSync(join(dir, 'src/Clean.tsx'), 'export const A = () => <div className="p-md text-label" />;\n');
  writeFileSync(join(dir, 'src/paraglide/gen.tsx'), 'export const G = () => <div className="p-[12px] font-mono" />;\n');
  writeFileSync(
    join(dir, 'src/components/ui/Btn.tsx'),
    'export const U = () => <div className="w-[10px] font-mono" />;\n',
  );

  assert.deepEqual(lintTokens(join(dir, 'src')), []);

  writeFileSync(join(dir, 'src/BadArb.tsx'), 'export const B = () => <div className="p-[12px]" />;\n');
  writeFileSync(join(dir, 'src/BadMono.tsx'), 'export const C = () => <code className="font-mono" />;\n');

  const result = spawnSync(process.execPath, [script, 'src'], {
    cwd: dir,
    encoding: 'utf8',
    // Strip rg from PATH to verify pure-Node execution works on any platform.
    env: { PATH: dirname(process.execPath) },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BadArb\.tsx:1: arbitrary-value/);
  assert.match(result.stderr, /BadMono\.tsx:1: font-mono/);
  assert.doesNotMatch(result.stderr, /paraglide|components\/ui/);

  writeFileSync(join(dir, 'src/BadArb.tsx'), 'export const B = () => <div className="p-sm" />;\n');
  writeFileSync(join(dir, 'src/BadMono.tsx'), 'export const C = () => <code className="text-code" />;\n');
  const clean = spawnSync(process.execPath, [script, 'src'], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: dirname(process.execPath) },
  });
  assert.equal(clean.status, 0, clean.stderr);
});
