import assert from 'node:assert/strict';
import { test } from 'node:test';
import { namespaceOperation, nextIdBase } from './module-link.ts';

// Every tRPC client counts its operations from 1, and all of them share one socket that keys requests by id: two
// subscriptions with the same id make the server answer "Duplicate id" and the second one never gets data.
void test('two module clients never hand the shared socket the same operation id, nor one the main client uses', () => {
  const first = nextIdBase();
  const second = nextIdBase();
  const a = namespaceOperation({ id: 1, path: 'onState' }, 'hello', first);
  const b = namespaceOperation({ id: 1, path: 'onState' }, 'hue', second);
  assert.notEqual(a.id, b.id);
  assert.ok(a.id > 1_000_000 && b.id > 1_000_000, 'the main client counts up from 1 and stays far below');
});

void test('the module name prefixes the path and the rest of the operation is untouched', () => {
  const op = { id: 3, path: 'setPower', type: 'mutation' };
  assert.deepEqual(namespaceOperation(op, 'hue', 0), { id: 3, path: 'hue.setPower', type: 'mutation' });
});
