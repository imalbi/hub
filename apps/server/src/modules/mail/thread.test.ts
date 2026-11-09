import assert from 'node:assert/strict';
import { test } from 'node:test';
import { threadOf, type ThreadEntry } from './thread.ts';

const entry = (fields: Partial<ThreadEntry> & Pick<ThreadEntry, 'id' | 'mailbox'>): ThreadEntry => ({
  messageId: null,
  inReplyTo: [],
  subject: '',
  date: null,
  ...fields,
});

const question = entry({
  id: '42',
  mailbox: 'sent',
  messageId: 'ask@example.org',
  subject: 'Domanda',
  date: '2026-11-04T10:00:00Z',
});
const reply = entry({
  id: '308',
  mailbox: 'inbox',
  messageId: 'reply@example.org',
  inReplyTo: ['ask@example.org'],
  date: '2026-11-05T15:00:00Z',
});

void test('a reply in the inbox joins the sent question into one thread, last message from the other side', () => {
  const thread = threadOf([question, reply], 'ask@example.org');
  assert.deepEqual(
    thread?.messages.map((message) => message.id),
    ['42', '308'],
  );
  assert.equal(thread?.waiting, false);
});

void test('the last message from the owner means the thread is waiting for a reply', () => {
  const followUp = entry({
    id: '43',
    mailbox: 'sent',
    messageId: 'followup@example.org',
    inReplyTo: ['reply@example.org'],
    date: '2026-11-07T14:00:00Z',
  });
  const thread = threadOf([question, reply, followUp], 'ask@example.org');
  assert.equal(thread?.waiting, true);
  assert.deepEqual(
    thread?.messages.map((message) => message.id),
    ['42', '308', '43'],
  );
});

void test('a message only in the sent mailbox is a thread of its own, waiting for a reply', () => {
  const alone = entry({ id: '7', mailbox: 'sent', messageId: 'alone@example.org', date: '2026-11-06T09:00:00Z' });
  const thread = threadOf([alone], 'alone@example.org');
  assert.deepEqual(
    thread?.messages.map((message) => message.id),
    ['7'],
  );
  assert.equal(thread?.waiting, true);
});

void test('an unrelated message is left out, and a Message-ID nobody lists has no thread', () => {
  const unrelated = entry({
    id: '309',
    mailbox: 'inbox',
    messageId: 'news@example.org',
    date: '2026-11-06T08:00:00Z',
  });
  const thread = threadOf([question, reply, unrelated], 'ask@example.org');
  assert.equal(
    thread?.messages.some((message) => message.id === '309'),
    false,
  );
  assert.equal(threadOf([question, reply], 'missing@example.org'), null);
});

void test('a message without a Message-ID cannot be linked and is left out', () => {
  const headless = entry({ id: '5', mailbox: 'inbox', inReplyTo: ['ask@example.org'], date: '2026-11-05T00:00:00Z' });
  const thread = threadOf([question, headless], 'ask@example.org');
  assert.deepEqual(
    thread?.messages.map((message) => message.id),
    ['42'],
  );
});
