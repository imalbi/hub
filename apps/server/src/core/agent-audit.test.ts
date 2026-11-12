import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from '../db/index.ts';
import { agentCalls } from '../db/schema.ts';
import { recordAgentCall } from './agent-audit.ts';

void test('audit masks token values and keeps the last 500 calls', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.$client.close());
  for (let index = 0; index < 501; index++)
    await recordAgentCall(db, {
      agentId: 1,
      name: 'Test',
      action: 'test',
      input: { token: 'abcdefghijklmnopqrstuvwxyz1234567890', index }, // guard-private: allow synthetic test token
      result: { ok: true },
      durationMs: 1,
    });
  const rows = await db.select().from(agentCalls).orderBy(agentCalls.id);
  assert.equal(rows.length, 500);
  assert.equal(rows[0]?.id, 2);
  assert.equal(rows[0]?.input.includes('abcdefghijklmnopqrstuvwxyz1234567890'), false);
  assert.equal(JSON.parse(rows[0]?.input ?? '{}').token, 'ab***');
});

void test('an audit value cannot suppress masking with a guard allow comment', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.$client.close());
  const value = ['/home', 'example', 'private'].join('/') + ' // guard-private: allow example';
  await recordAgentCall(db, {
    agentId: 1,
    name: 'Test',
    action: 'test',
    input: { text: value },
    result: null,
    durationMs: 0,
  });
  const [row] = await db.select().from(agentCalls);
  assert.equal(row?.input.includes(value), false);
});
