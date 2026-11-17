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
    { type: 'object', properties: { items: { type: 'array' } }, required: ['items'] },
    {
      type: 'object',
      properties: { value: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
      required: ['value'],
    },
    { type: 'object', properties: { value: { type: 'object' } }, required: ['value'] },
    { allOf: [] },
  ];
  for (const schema of schemas) {
    assert.equal(paletteFields(schema, false), null);
  }
});

void test('an optional field the palette cannot draw is left out, so the action still runs', () => {
  const fields = paletteFields(
    {
      type: 'object',
      properties: { text: { type: 'string' }, about: { type: 'object', properties: { id: { type: 'string' } } } },
      required: ['text'],
    },
    false,
  );
  assert.deepEqual(
    fields?.map((field) => field.name),
    ['text'],
  );
});
