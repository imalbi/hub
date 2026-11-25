import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildForm } from './schema-fields.ts';
import { getAt, setAt } from './path.ts';

const schema = {
  type: 'object',
  properties: {
    location: { type: 'string', default: 'Roma' },
    profile: { type: 'string', multiline: true },
    hours: { type: 'integer' },
    remote: { type: 'boolean' },
    mode: { type: 'string', enum: ['a', 'b'] },
    sites: { type: 'array', items: { type: 'string', enum: ['x', 'y'] } },
    companies: { type: 'array', items: { type: 'string' } },
    nullable: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    queries: { type: 'array', items: { type: 'object', properties: { q: { type: 'object', properties: {} } } } },
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
  assert.equal(fields.find((f) => f.path.join('.') === 'location')?.placeholder, 'Roma');
});

void test('lists of nested objects and unions are JSON blocks, named by their key', () => {
  const { blocks } = buildForm(schema);
  assert.deepEqual(
    blocks.map((b) => b.path.join('.')),
    ['queries', 'either'],
  );
});

const labelled = {
  type: 'object',
  required: ['hours'],
  properties: {
    hours: { type: 'integer', title: 'Ore', description: 'Help', unit: 'ore', default: 4, minimum: 1, maximum: 9 },
    untitled: { type: 'string' },
    where: { type: 'integer', minimum: 1, maximum: 3, optionLabels: { 1: 'In sede', 2: 'Remoto', 3: 'Ibrido' } },
    wheres: { type: 'array', items: { type: 'integer' }, optionLabels: { 1: 'In sede', 3: 'Ibrido' } },
    level: { type: 'string', enum: ['a', 'b'], optionLabels: { a: 'Alto' } },
    weights: { type: 'object', propertyNames: { type: 'string' }, additionalProperties: { type: 'number' } },
    categories: {
      type: 'object',
      propertyNames: { type: 'string' },
      additionalProperties: { type: 'array', items: { type: 'string' } },
    },
    outputs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['label'],
        properties: {
          label: { type: 'string', title: 'Nome' },
          match: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          on: { type: 'boolean' },
        },
      },
    },
    search: {
      type: 'object',
      title: 'Ricerca',
      description: 'Help ricerca',
      properties: { deep: { type: 'object', properties: { n: { type: 'number' } } } },
    },
    nested: {
      type: 'array',
      title: 'Annidati',
      items: { type: 'object', properties: { tags: { type: 'array', items: { type: 'object' } } } },
    },
  },
};

const field = (path: string) => buildForm(labelled).fields.find((f) => f.path.join('.') === path);

void test('label, description, unit, default, optional and number bounds are read', () => {
  assert.deepEqual(
    { ...field('hours'), path: undefined },
    {
      path: undefined,
      label: 'Ore',
      description: 'Help',
      unit: 'ore',
      default: 4,
      optional: false,
      placeholder: '4',
      kind: 'number',
      integer: true,
      min: 1,
      max: 9,
    },
  );
  assert.equal(field('untitled')?.label, 'untitled');
  assert.equal(field('untitled')?.optional, true);
  assert.equal(field('untitled')?.default, undefined);
});

void test('an integer with optionLabels is a choice of numbers', () => {
  assert.deepEqual(field('where'), {
    ...field('where'),
    kind: 'choice',
    options: [
      { value: 1, label: 'In sede' },
      { value: 2, label: 'Remoto' },
      { value: 3, label: 'Ibrido' },
    ],
  });
});

void test('an array of integers with optionLabels is a multi with labels; string enums are labelled or plain', () => {
  const wheres = field('wheres');
  assert.equal(wheres?.kind, 'multi');
  assert.deepEqual(wheres?.kind === 'multi' && wheres.options, [
    { value: 1, label: 'In sede' },
    { value: 3, label: 'Ibrido' },
  ]);
  const level = field('level');
  assert.deepEqual(level?.kind === 'choice' && level.options, [
    { value: 'a', label: 'Alto' },
    { value: 'b', label: 'b' },
  ]);
});

void test('records become numberMap and wordsMap', () => {
  assert.equal(field('weights')?.kind, 'numberMap');
  assert.equal(field('categories')?.kind, 'wordsMap');
});

void test('a list of flat objects is rows, with a column per property', () => {
  const outputs = field('outputs');
  assert.equal(outputs?.kind, 'rows');
  const columns = outputs?.kind === 'rows' ? outputs.columns : [];
  assert.deepEqual(
    columns.map((c) => [c.path.join('.'), c.label, c.kind, c.optional]),
    [
      ['label', 'Nome', 'text', false],
      ['match', 'match', 'text', true],
      ['on', 'on', 'boolean', true],
    ],
  );
});

void test('a list of nested objects stays a block, labelled by title else key', () => {
  const form = buildForm(labelled);
  assert.equal(field('nested'), undefined);
  assert.deepEqual(
    form.blocks.map((b) => [b.path.join('.'), b.label]),
    [['nested', 'Annidati']],
  );
});

void test('sections carry the object title, else the last key', () => {
  assert.deepEqual(
    buildForm(labelled).sections.map((s) => [s.path.join('.'), s.label, s.description]),
    [
      ['search', 'Ricerca', 'Help ricerca'],
      ['search.deep', 'deep', undefined],
    ],
  );
  assert.deepEqual(
    buildForm(schema).sections.map((s) => s.label),
    ['access'],
  );
});

void test('a schema with nothing to draw (open object, unknown) has no fields or blocks at the root', () => {
  assert.deepEqual(buildForm({ type: 'object' }), { fields: [], blocks: [], sections: [] });
  assert.deepEqual(buildForm({}), { fields: [], blocks: [], sections: [] });
});

void test('setAt writes and removes values, and drops objects it empties', () => {
  assert.deepEqual(setAt({}, ['a', 'b'], 1), { a: { b: 1 } });
  assert.deepEqual(setAt({ a: { b: 1 }, c: 2 }, ['a', 'b'], undefined), { c: 2 });
  assert.equal(getAt({ a: { b: 1 } }, ['a', 'b']), 1);
  assert.equal(getAt({ a: 1 }, ['a', 'b']), undefined);
});
