import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildForm } from './schema-fields.ts';
import { getAt, setAt } from './path.ts';

const schema = {
  type: 'object',
  properties: {
    location: { type: 'string', default: 'Torino' },
    profile: { type: 'string', multiline: true },
    hours: { type: 'integer' },
    remote: { type: 'boolean' },
    mode: { type: 'string', enum: ['a', 'b'] },
    sites: { type: 'array', items: { type: 'string', enum: ['x', 'y'] } },
    companies: { type: 'array', items: { type: 'string' } },
    nullable: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    weights: { type: 'object', propertyNames: { type: 'string' }, additionalProperties: { type: 'number' } },
    queries: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' } } } },
    access: { type: 'object', properties: { key: { type: 'string', secret: true }, domain: { type: 'string' } } },
    either: { anyOf: [{ type: 'string' }, { type: 'number' }] },
  },
};

void test('flat leaves become controls, even inside plain objects', () => {
  const { fields } = buildForm(schema);
  const byPath = Object.fromEntries(fields.map((f) => [f.path.join('.'), f.kind]));
  assert.deepEqual(byPath, {
    location: 'text',
    profile: 'multiline',
    hours: 'number',
    remote: 'boolean',
    mode: 'choice',
    sites: 'multi',
    companies: 'words',
    nullable: 'text',
    'access.key': 'secret',
    'access.domain': 'text',
  });
  assert.equal(fields.find((f) => f.path.join('.') === 'location')?.placeholder, 'Torino');
});

void test('maps, lists of objects and unions are JSON blocks, named by their path', () => {
  const { blocks } = buildForm(schema);
  assert.deepEqual(
    blocks.map((b) => b.path.join('.')),
    ['weights', 'queries', 'either'],
  );
});

void test('a schema with nothing to draw (open object, unknown) has no fields or blocks at the root', () => {
  assert.deepEqual(buildForm({ type: 'object' }), { fields: [], blocks: [] });
  assert.deepEqual(buildForm({}), { fields: [], blocks: [] });
});

void test('setAt writes and removes values, and drops objects it empties', () => {
  assert.deepEqual(setAt({}, ['a', 'b'], 1), { a: { b: 1 } });
  assert.deepEqual(setAt({ a: { b: 1 }, c: 2 }, ['a', 'b'], undefined), { c: 2 });
  assert.equal(getAt({ a: { b: 1 } }, ['a', 'b']), 1);
  assert.equal(getAt({ a: 1 }, ['a', 'b']), undefined);
});
