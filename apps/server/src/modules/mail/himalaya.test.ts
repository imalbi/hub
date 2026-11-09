import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Run, RunResult } from '../../core/exec.ts';
import {
  envelopesSchema,
  filterSchema,
  filterTokens,
  htmlToText,
  himalaya,
  idSchema,
  MAIL_TIMEOUT_MS,
  messageViewSchema,
  missingEnvelopeFields,
  plainTextOf,
  quoteValue,
  searchArgs,
  toMessage,
} from './himalaya.ts';
import { z } from 'zod';

const messages = z
  .record(z.string(), messageViewSchema)
  .parse(JSON.parse(readFileSync(new URL('fixtures/messages.json', import.meta.url), 'utf8')));
const schemaText = readFileSync(new URL('fixtures/envelope-list.schema.json', import.meta.url), 'utf8');

void test('a value with spaces, and or or quotes stays one token of the query', () => {
  assert.deepEqual(filterTokens({ subject: 'Offerta and dintorni' }), ['subject', '"Offerta and dintorni"']);
  assert.deepEqual(filterTokens({ from: 'x or "y"' }), ['from', '"x or \\"y\\""']);
  assert.equal(quoteValue('a\\b'), '"a\\\\b"');
});

void test('an unseen filter combined with a sender is the token list himalaya parses', () => {
  assert.deepEqual(filterTokens({ from: 'Alice', unseen: true }), ['from', '"Alice"', 'and', 'not', 'flag', 'seen']);
  assert.deepEqual(filterTokens({ after: '2026-11-01' }), ['after', '2026-11-01']);
  assert.deepEqual(filterTokens({}), []);
});

void test('a search is the full argv: --json, the account, the mailbox, the page and the query as separate elements', () => {
  assert.deepEqual(searchArgs('work', 'INBOX', 2, 25, { from: 'Alice', unseen: true }), [
    '--json',
    '-a',
    'work',
    'envelope',
    'search',
    '-m',
    'INBOX',
    '-p',
    '2',
    '-s',
    '25',
    'from',
    '"Alice"',
    'and',
    'not',
    'flag',
    'seen',
  ]);
});

void test('filters are checked before they reach an argv: length, control characters and dates', () => {
  assert.equal(filterSchema.safeParse({ from: 'a'.repeat(201) }).success, false);
  assert.equal(filterSchema.safeParse({ subject: 'line\nbreak' }).success, false);
  assert.equal(filterSchema.safeParse({ after: '2026-13-40' }).success, false);
  assert.equal(filterSchema.safeParse({ after: '2026-11-01', unseen: true }).success, true);
});

void test('ids that could be read as an option are refused', () => {
  for (const id of ['-f', '--seen', '', 'a b']) assert.equal(idSchema.safeParse(id).success, false, id);
  assert.equal(idSchema.safeParse('1700000000.1.probe').success, true);
});

void test('a plain text message gives its text', () => {
  assert.equal(plainTextOf(messages['work/310']), 'Buongiorno,\nvorremmo proporle un colloquio.');
});

void test('a multipart message gives its plain text part, never the HTML one', () => {
  assert.equal(plainTextOf(messages['work/308']), 'Versione testo della risposta.');
});

void test('an HTML-only message gives text with no tags, no script or style, and no image', () => {
  const text = plainTextOf(messages['work/309']);
  assert.equal(text, 'Titolo\nPrimo paragrafo & resto.\nSecondo\nriga');
  assert.doesNotMatch(text, /[<>]/);
  assert.doesNotMatch(text, /alert|color|pixel/);
});

void test('hostile markup never leaves the converter as markup', () => {
  const hostile = [
    '<script>steal()</script>ok',
    '<img src="https://example.org/x.png" onerror="steal()">text',
    '<a href="javascript:steal()">link</a>',
    '<style>body{}</style><p>para</p>',
    '<iframe src="https://example.org"></iframe>visible',
  ];
  for (const html of hostile) {
    const text = htmlToText(html);
    assert.doesNotMatch(text, /<\/?[a-z][^>]*>/i, html);
    assert.doesNotMatch(text, /steal|javascript:/, html);
  }
});

const answer =
  (result: RunResult): Run =>
  () =>
    Promise.resolve(result);

void test('the runner reports each way a call can fail as a reason, never as a throw', async () => {
  const schema = envelopesSchema;
  assert.deepEqual(await himalaya(answer({ stdout: '', stderr: 'x', code: 1 }), ['x'], schema), {
    ok: false,
    failure: 'failed',
  });
  assert.deepEqual(await himalaya(answer({ stdout: '', stderr: '', code: -1 }), ['x'], schema), {
    ok: false,
    failure: 'timeout',
  });
  assert.deepEqual(await himalaya(answer({ stdout: '{"error":"no account"}', stderr: '', code: 0 }), ['x'], schema), {
    ok: false,
    failure: 'failed',
  });
  assert.deepEqual(await himalaya(answer({ stdout: 'not json', stderr: '', code: 0 }), ['x'], schema), {
    ok: false,
    failure: 'unreadable',
  });
  assert.deepEqual(
    await himalaya(
      answer({ stdout: '{"queued":0,"envelopes":[{"subject":"no id"}]}', stderr: '', code: 0 }),
      ['x'],
      schema,
    ),
    { ok: false, failure: 'unreadable' },
  );
});

void test('the runner gives the mail timeout and the argv it was asked for', async () => {
  const seen: { bin: string; args: readonly string[]; timeoutMs?: number }[] = [];
  const run: Run = (bin, args, options) => {
    seen.push({ bin, args, timeoutMs: options?.timeoutMs });
    return Promise.resolve({ stdout: '{"queued":0,"envelopes":[]}', stderr: '', code: 0 });
  };
  const result = await himalaya(run, ['--json', '-a', 'work', 'envelope', 'list'], envelopesSchema);
  assert.deepEqual(result, { ok: true, value: { queued: 0, envelopes: [] } });
  assert.deepEqual(seen, [
    { bin: 'himalaya', args: ['--json', '-a', 'work', 'envelope', 'list'], timeoutMs: MAIL_TIMEOUT_MS },
  ]);
});

void test('the envelope fields Hub reads are all in himalaya 2.2.1 schema, and a removed one is named', () => {
  assert.deepEqual(missingEnvelopeFields(schemaText), []);
  const withoutAttachment = JSON.parse(schemaText);
  delete withoutAttachment.$defs.Envelope.properties['has-attachment'];
  assert.deepEqual(missingEnvelopeFields(JSON.stringify(withoutAttachment)), ['has-attachment']);
  assert.equal(missingEnvelopeFields('not a schema'), null);
});

void test('a row tells seen and flagged from himalaya flags, and keeps only the first sender', () => {
  const envelope = envelopesSchema.parse({
    envelopes: [
      {
        id: '1',
        flags: [{ raw: '\\Seen', iana: 'seen' }, { raw: '\\Flagged' }],
        from: [
          { name: 'First', email: 'first@example.org' },
          { name: 'Second', email: 'second@example.org' },
        ],
      },
    ],
  }).envelopes[0];
  assert.ok(envelope);
  assert.deepEqual(toMessage(envelope), {
    id: '1',
    messageId: null,
    subject: '',
    from: { name: 'First', email: 'first@example.org' },
    date: null,
    seen: true,
    flagged: true,
    hasAttachment: null,
  });
});
