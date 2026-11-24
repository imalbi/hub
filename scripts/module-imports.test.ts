import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moduleImportViolation, ignoresModules } from './module-imports.ts';

const privatePath = ['modules', 'local'].join('.') + '/sample/server.ts';
const installedPath = ['modules', 'installed'].join('.') + '/sample/server.ts';
const reposPath = ['modules', 'repos'].join('.') + '/sample/server.ts';
void test('private and catalog source paths are confined to the three discovery points', () => {
  for (const target of [privatePath, installedPath, reposPath]) {
    for (const source of [
      `import x from '../${target}'`,
      `export { x } from '../${target}'`,
      `const x = import('../${target}')`,
      `const x = require('../${target}')`,
    ])
      assert.equal(moduleImportViolation('apps/web/src/other.ts', source), true);
    assert.equal(moduleImportViolation('apps/server/src/core/discovery.ts', `import('../${target}')`), false);
    assert.equal(moduleImportViolation('apps/web/src/lib/modules.ts', `import.meta.glob('../${target}')`), false);
    // Tailwind's @source is the third point; any other stylesheet naming the folder is refused.
    assert.equal(moduleImportViolation('apps/web/src/index.css', `@source '../../../${target}';`), false);
    assert.equal(moduleImportViolation('apps/web/src/other.css', `@source '../../../${target}';`), true);
    assert.equal(moduleImportViolation('README.md', `Use ${target}`), false);
  }
  assert.equal(moduleImportViolation('source.ts', `import type { AppRouter } from '@hub/server'`), false);
});
void test('the root ignore covers private, installed and repos directories without negating their contents', () => {
  // Built at runtime: the literal path in a tracked file is what the guards refuse.
  const localDir = ['modules', 'local'].join('.');
  const installedDir = ['modules', 'installed'].join('.');
  const reposDir = ['modules', 'repos'].join('.');
  assert.equal(ignoresModules('modules[.]local/\nmodules[.]installed\nmodules[.]repos\n'), true);
  assert.equal(ignoresModules('modules[.]local\nmodules[.]installed\nmodules[.]repos\n'), true);
  assert.equal(ignoresModules(`${localDir}/\n${installedDir}/\n${reposDir}/\n`), true);
  assert.equal(ignoresModules(`${localDir}\n${installedDir}\n${reposDir}\n`), true);
  assert.equal(ignoresModules('modules[.]local/\n'), false);
  assert.equal(ignoresModules('modules[.]local\nmodules[.]installed\n'), false);
  assert.equal(ignoresModules('node_modules/\n'), false);
  assert.equal(ignoresModules(`${localDir}/\n${installedDir}/\n${reposDir}/\n!${installedDir}/keep.ts\n`), false);
});
