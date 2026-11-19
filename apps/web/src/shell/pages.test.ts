import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeDeckTiles } from './pages.ts';

void test('unpositioned tiles use the last page with enough rendered space, or create a page', () => {
  const pages = [
    { id: 'desk', label: 'Desk', tiles: ['a'], count: 11 },
    { id: 'system', label: 'System', tiles: ['monitors'], count: 12 },
  ];
  const deck = { id: 'hello', label: 'Hello', tiles: ['hello'] };
  assert.deepEqual(
    placeDeckTiles(pages, deck).map((page) => page.tiles),
    [['a', 'hello'], ['monitors']],
  );
  assert.deepEqual(
    placeDeckTiles(
      pages.map((page) => ({ ...page, count: 12 })),
      deck,
    ).map((page) => page.id),
    ['desk', 'system', 'hello'],
  );
  assert.deepEqual(pages[0].tiles, ['a']);
});

void test("a module's tiles stay together on one page", () => {
  const pages = [
    { id: 'desk', label: 'Desk', tiles: ['a'], count: 10 },
    { id: 'system', label: 'System', tiles: ['monitors'], count: 11 },
  ];
  const deck = { id: 'hello', label: 'Hello', tiles: ['one', 'two'] };
  assert.deepEqual(
    placeDeckTiles(pages, deck).map((page) => page.tiles),
    [['a', 'one', 'two'], ['monitors']],
  );
});

void test('tiles go before the tail, so the holds stay last', () => {
  const pages = [{ id: 'system', label: 'System', tiles: ['power', 'suspend', 'reboot', 'off'], count: 4, tail: 3 }];
  assert.deepEqual(placeDeckTiles(pages, { id: 'hello', label: 'Hello', tiles: ['hello'] })[0].tiles, [
    'power',
    'hello',
    'suspend',
    'reboot',
    'off',
  ]);
});
