import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RegistryAction } from './palette-input.ts';
import { paletteFields } from './palette-input.ts';

void test('flat forms preserve required fields, ranges, enum values and optional inputs', () => {
  assert.deepEqual(
    paletteFields(
      {
        type: 'object',
        properties: {
          percent: { type: 'integer', minimum: 1, maximum: 100 },
          name: { type: 'string', minLength: 1 },
          on: { type: 'boolean' },
          mode: { type: 'string', enum: ['up', 'down'] },
          confirmed: { type: 'boolean', const: true },
        },
        required: ['percent', 'on', 'confirmed'],
      },
      true,
    )?.map((f) => [f.name, f.required]),
    [
      ['percent', true],
      ['name', false],
      ['on', true],
      ['mode', false],
    ],
  );
  assert.deepEqual(paletteFields(null, false), []);
});

void test('unsupported nested, union, array and unconstrained schemas cannot run', () => {
  const schemas: RegistryAction['schema'][] = [
    { not: {} },
    {},
    { type: 'object', properties: { items: { type: 'array' } } },
    { type: 'object', properties: { value: { anyOf: [{ type: 'string' }, { type: 'null' }] } } },
    { type: 'object', properties: { value: { type: 'object' } } },
    { allOf: [] },
  ];
  for (const schema of schemas) {
    assert.equal(paletteFields(schema, false), null);
  }
});
