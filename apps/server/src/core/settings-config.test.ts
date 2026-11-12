import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { z } from 'zod';
import { hasManualChanges } from './settings-config.ts';

void test('manual and secret values cannot change, including inside arrays and union branches', () => {
  const schema = z.object({
    items: z.array(z.object({ password: z.string().meta({ secret: true }), name: z.string() })),
    host: z.string().meta({ manual: true }),
    ordinary: z.string(),
  });
  const stored = { items: [{ password: 'old', name: 'a' }], host: 'localhost', ordinary: 'before' };
  assert.equal(hasManualChanges(schema, stored, { ...stored, ordinary: 'after' }), false);
  assert.equal(hasManualChanges(schema, stored, { ...stored, host: 'other' }), true);
  assert.equal(hasManualChanges(schema, stored, { ...stored, items: [{ password: 'new', name: 'a' }] }), true);
  assert.equal(hasManualChanges(schema, stored, { ...stored, items: [] }), true);
});

void test('secret values in arrays are redacted and placeholders restore their original values', async () => {
  const { redactSchema, restoreSchemaSecrets } = await import('./settings-config.ts');
  const schema = z.object({ items: z.array(z.object({ token: z.string().meta({ secret: true }), name: z.string() })) });
  const value = { items: [{ token: 'secret', name: 'before' }] };
  const redacted = redactSchema(schema, value);
  assert.deepEqual(redacted, { items: [{ token: { set: true }, name: 'before' }] });
  assert.deepEqual(restoreSchemaSecrets(schema, redacted, value), value);
});

void test('secret record values are redacted, restored and cannot be changed by an agent', async () => {
  const { redactSchema, restoreSchemaSecrets } = await import('./settings-config.ts');
  const schema = z.object({ keys: z.record(z.string(), z.string().meta({ secret: true })) });
  const stored = { keys: { first: 'secret' } };
  const redacted = { keys: { first: { set: true } } };
  assert.deepEqual(redactSchema(schema, stored), redacted);
  assert.deepEqual(restoreSchemaSecrets(schema, redacted, stored), stored);
  assert.equal(hasManualChanges(schema, stored, { keys: { first: 'changed' } }), true);
});
