import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moduleImportViolation, ignoresModules } from './module-imports.ts';

const privatePath = ['modules', 'local'].join('.') + '/sample/server.ts';
void test('private source paths are confined to the three discovery points', () => {
  for (const source of [
    `import x from '../${privatePath}'`,
    `export { x } from '../${privatePath}'`,
    `const x = import('../${privatePath}')`,
    `const x = require('../${privatePath}')`,
  ])
    assert.equal(moduleImportViolation('apps/web/src/other.ts', source), true);
  assert.equal(moduleImportViolation('apps/server/src/core/discovery.ts', `import('../${privatePath}')`), false);
  assert.equal(moduleImportViolation('apps/web/src/lib/modules.ts', `import.meta.glob('../${privatePath}')`), false);
  // Tailwind's @source is the third point; any other stylesheet naming the folder is refused.
  assert.equal(moduleImportViolation('apps/web/src/index.css', `@source '../../../${privatePath}';`), false);
  assert.equal(moduleImportViolation('apps/web/src/other.css', `@source '../../../${privatePath}';`), true);
  assert.equal(moduleImportViolation('README.md', `Use ${privatePath}`), false);
  assert.equal(moduleImportViolation('source.ts', `import type { AppRouter } from '@hub/server'`), false);
});
void test('the root ignore covers private modules without negating their contents', () => {
  // Built at runtime: the literal path in a tracked file is what the guards refuse.
  const dir = ['modules', 'local'].join('.');
  assert.equal(ignoresModules('modules[.]local/\n'), true);
  assert.equal(ignoresModules('modules[.]local\n'), true);
  assert.equal(ignoresModules(`${dir}/\n`), true);
  assert.equal(ignoresModules(`${dir}\n`), true);
  assert.equal(ignoresModules('node_modules/\n'), false);
  assert.equal(ignoresModules(`${dir}/\n!${dir}/keep.ts\n`), false);
});
