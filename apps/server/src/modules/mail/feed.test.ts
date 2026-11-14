import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextFeed, type FeedCursor, type FetchPage } from './feed.ts';
import type { MailMessage } from './himalaya.ts';

const message = (id: string, day: number): MailMessage => ({
  id,
  messageId: null,
  subject: id,
  from: null,
  date: `2026-11-${String(day).padStart(2, '0')}T09:00:00Z`,
  seen: true,
  flagged: false,
  hasAttachment: null,
});

// Newest first, as himalaya lists them.
const boxes: Record<string, MailMessage[]> = {
  a: [message('a1', 20), message('a2', 18), message('a3', 16), message('a4', 14), message('a5', 12)],
  b: [message('b1', 19), message('b2', 9), message('b3', 8)],
};

function listing(size: number) {
  const calls: string[] = [];
  const fetchPage: FetchPage = (account, page) => {
    calls.push(`${account}:${page}`);
    return Promise.resolve({ ok: true, value: (boxes[account] ?? []).slice((page - 1) * size, page * size) });
  };
  return { calls, fetchPage };
}

async function walk(accounts: string[], size: number) {
  const { fetchPage } = listing(size);
  const ids: string[] = [];
  let cursor: FeedCursor | null = {};
  while (cursor) {
    const result = await nextFeed(accounts, cursor, size, fetchPage);
    assert.ok(result.ok);
    ids.push(...result.value.rows.map((row) => row.id));
    cursor = result.value.cursor;
  }
  return ids;
}

void test('two inboxes merge newest first across pages, each row once', async () => {
  assert.deepEqual(await walk(['a', 'b'], 3), ['a1', 'b1', 'a2', 'a3', 'a4', 'a5', 'b2', 'b3']);
});

void test('one account pages through its own listing in order', async () => {
  assert.deepEqual(await walk(['b'], 2), ['b1', 'b2', 'b3']);
});

void test('a row is held back while an account that has more pages could still hold a newer one', async () => {
  const { fetchPage } = listing(2);
  const first = await nextFeed(['a', 'b'], {}, 2, fetchPage);
  assert.ok(first.ok);
  // b's page ends at day 9 but a's at day 18: nothing older than 18 is safe until a is read further.
  assert.deepEqual(
    first.value.rows.map((row) => row.id),
    ['a1', 'b1'],
  );
  assert.deepEqual(first.value.cursor, { a: 1, b: 1 });
});

void test('a failed account fails the whole call', async () => {
  const result = await nextFeed(['a', 'b'], {}, 3, (account) =>
    Promise.resolve(account === 'b' ? { ok: false, failure: 'failed' } : { ok: true, value: [] }),
  );
  assert.deepEqual(result, { ok: false, failure: 'failed' });
});

void test('the end: no cursor once every account is read out', async () => {
  const { fetchPage } = listing(10);
  const result = await nextFeed(['b'], {}, 10, fetchPage);
  assert.ok(result.ok);
  assert.equal(result.value.cursor, null);
  assert.equal(result.value.rows.length, 3);
});
