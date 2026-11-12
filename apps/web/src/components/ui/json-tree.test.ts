import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffTree, formatPath } from './json-tree.ts';

void test('diffTree marks added, removed and changed keys with counts', () => {
  const tree = diffTree({ a: 1, b: 2, c: 3 }, { a: 1, b: 5, d: 4 });
  const by = Object.fromEntries((tree.children ?? []).map((c) => [String(c.key), c.change]));
  assert.deepEqual(by, { a: 'same', b: 'changed', d: 'added', c: 'removed' });
  assert.deepEqual(tree.counts, { added: 1, removed: 1, changed: 1 });
});

void test('formatPath writes js and jq paths', () => {
  assert.equal(formatPath(['data', 'items', 2, 'id']), 'data.items[2].id');
  assert.equal(formatPath(['data', 'items', 2, 'id'], 'jq'), '.data.items[2].id');
});
