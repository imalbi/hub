import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setAt } from './path.ts';

void test('a root array can be edited without changing its shape', () => {
  const sites = [{ name: 'Esempio', url: 'https://example.com' }];
  assert.deepEqual(setAt(undefined, [], sites), sites);
});
