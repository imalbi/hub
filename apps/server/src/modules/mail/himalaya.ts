import { z } from 'zod';
import type { Run } from '../../core/exec.ts';
import { parseHTML } from '../../core/module-html.ts';

// A mail account answers after a login and a listing over the network: the default 3 s of `run` is too short.
export const MAIL_TIMEOUT_MS = 20_000;
export const PAGE_SIZE = 25;
// The unread count and the latest rows come from one listing; past this many rows the count says "at least".
export const UNREAD_WINDOW = 100;
export const THREAD_WINDOW = 200;
export const MAX_TEXT_CHARS = 200_000;

const BIN = 'himalaya';

export type MailFailure = 'timeout' | 'failed' | 'unreadable';
export type MailResult<T> = { ok: true; value: T } | { ok: false; failure: MailFailure };

// Values that reach argv: ids and mailbox names never start with `-`, so himalaya cannot read them as an option.
export const idSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
export const mailboxSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[^\s-][^\0\r\n]*$/);
const queryValueSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[^\0\r\n]+$/);

/** What the UI may ask for. Built into himalaya tokens by `filterTokens`; no free-form query reaches himalaya. */
export const filterSchema = z.object({
  from: queryValueSchema.optional(),
  subject: queryValueSchema.optional(),
  body: queryValueSchema.optional(),
  after: z.iso.date().optional(),
  unseen: z.boolean().optional(),
});
export type MailFilter = z.infer<typeof filterSchema>;

/** Quoted so that a space, `and`, `or` or a quote inside the value stays one literal word of himalaya's query. */
export function quoteValue(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&')}"`;
}

/** Each element is one token of the query. himalaya joins them with spaces and parses the result, so they are kept whole. */
export function filterTokens(filter: MailFilter): string[] {
  const terms: string[][] = [];
  if (filter.from) terms.push(['from', quoteValue(filter.from)]);
  if (filter.subject) terms.push(['subject', quoteValue(filter.subject)]);
  if (filter.body) terms.push(['body', quoteValue(filter.body)]);
  if (filter.after) terms.push(['after', filter.after]);
  if (filter.unseen) terms.push(['not', 'flag', 'seen']);
  return terms.flatMap((term, index) => (index === 0 ? term : ['and', ...term]));
}

const common = (account: string) => ['--json', '-a', account];

export function listArgs(account: string, mailbox: string, page: number, size: number): string[] {
  return [...common(account), 'envelope', 'list', '-m', mailbox, '-p', String(page), '-s', String(size)];
}

export function searchArgs(account: string, mailbox: string, page: number, size: number, filter: MailFilter) {
  return [
    ...common(account),
    'envelope',
    'search',
    '-m',
    mailbox,
    '-p',
    String(page),
    '-s',
    String(size),
    ...filterTokens(filter),
  ];
}

/** No `--seen`: reading leaves the flags alone, marking is a separate action. */
export function readArgs(account: string, mailbox: string, id: string): string[] {
  return [...common(account), 'message', 'read', '-m', mailbox, id];
}

export function flagArgs(account: string, mailbox: string, add: boolean, flag: string, ids: readonly string[]) {
  return [...common(account), 'flag', add ? 'add' : 'remove', '-m', mailbox, '-f', flag, ...ids];
}

export const VERSION_ARGS = ['--version'];
export const ENVELOPE_SCHEMA_ARGS = ['json-schema', 'himalaya-envelope-list'];

const addressSchema = z.object({ name: z.string().nullish(), email: z.string().nullish() });
const flagSchema = z.object({ raw: z.string(), iana: z.string().nullish() });
export const envelopeSchema = z.object({
  id: z.string().min(1),
  'message-id': z.string().nullish(),
  'in-reply-to': z.array(z.string()).default([]),
  flags: z.array(flagSchema).default([]),
  subject: z.string().default(''),
  from: z.array(addressSchema).default([]),
  date: z.string().nullish(),
  size: z.number().nonnegative().default(0),
  'has-attachment': z.boolean().nullish(),
});
export const envelopesSchema = z.object({
  queued: z.number().nonnegative().default(0),
  envelopes: z.array(envelopeSchema),
});
type RawEnvelope = z.output<typeof envelopeSchema>;

/** The fields of `envelope list` that Hub reads; `missingEnvelopeFields` checks them against himalaya's own schema. */
export const ENVELOPE_FIELDS = [
  'id',
  'message-id',
  'in-reply-to',
  'flags',
  'subject',
  'from',
  'date',
  'size',
  'has-attachment',
] as const;

/** Fields of `$defs.Envelope` in `himalaya json-schema himalaya-envelope-list` that this parser does not have. */
export function missingEnvelopeFields(schemaText: string): string[] | null {
  const parsed = z
    .object({ $defs: z.object({ Envelope: z.object({ properties: z.record(z.string(), z.unknown()) }) }) })
    .safeParse(parseJson(schemaText));
  if (!parsed.success) return null;
  const fields = parsed.data.$defs.Envelope.properties;
  return ENVELOPE_FIELDS.filter((field) => !(field in fields));
}

export const flagResultSchema = z.object({ flags: z.array(z.string()) });

export const messageViewSchema = z.object({
  parts: z.array(z.object({ body: z.unknown().optional() })),
  text_body: z.array(z.number().int().nonnegative()).default([]),
  html_body: z.array(z.number().int().nonnegative()).default([]),
});
export type MessageView = z.output<typeof messageViewSchema>;

/** What the UI shows of a row. Addresses stay in the answer to the owner's own client and never reach a log. */
export type MailMessage = {
  id: string;
  messageId: string | null;
  subject: string;
  from: { name: string | null; email: string | null } | null;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  hasAttachment: boolean | null;
};

export function toMessage(envelope: RawEnvelope): MailMessage {
  const flags = envelope.flags.map((flag) => (flag.iana ?? flag.raw).toLowerCase());
  const sender = envelope.from[0];
  return {
    id: envelope.id,
    messageId: envelope['message-id'] ?? null,
    subject: envelope.subject,
    from: sender ? { name: sender.name ?? null, email: sender.email ?? null } : null,
    date: envelope.date ?? null,
    seen: flags.some((flag) => flag === 'seen' || flag === '\\seen'),
    flagged: flags.some((flag) => flag === 'flagged' || flag === '\\flagged'),
    hasAttachment: envelope['has-attachment'] ?? null,
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const isErrorPayload = (value: unknown) => typeof value === 'object' && value !== null && 'error' in value;

/**
 * Runs himalaya with `--json` and parses its answer. A failed run, a timeout and an answer in an unexpected shape
 * are reasons, never exceptions: the caller turns them into an error state with a generic message.
 */
export async function himalaya<S extends z.ZodType>(
  run: Run,
  args: readonly string[],
  schema: S,
  timeoutMs = MAIL_TIMEOUT_MS,
): Promise<MailResult<z.output<S>>> {
  const result = await run(BIN, [...args], { timeoutMs });
  // `run` reports a timeout and a missing binary alike as -1.
  if (result.code === -1) return { ok: false, failure: 'timeout' };
  if (result.code !== 0) return { ok: false, failure: 'failed' };
  const json = parseJson(result.stdout);
  if (json === undefined) return { ok: false, failure: 'unreadable' };
  // himalaya prints its errors as JSON too; the exit code alone is not enough.
  if (isErrorPayload(json)) return { ok: false, failure: 'failed' };
  const parsed = schema.safeParse(json);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, failure: 'unreadable' };
}

const textBody = z.object({ Text: z.string() });
const htmlBody = z.object({ Html: z.string() });

/**
 * The text of a message as plain text. `text_body` may point at an HTML part (an HTML-only message), so the text
 * comes from `Text` parts first, and only when there are none from the HTML parts, stripped of their markup.
 */
export function plainTextOf(message: MessageView): string {
  const bodyAt = (index: number) => message.parts[index]?.body;
  const texts = message.text_body.flatMap((index) => {
    const parsed = textBody.safeParse(bodyAt(index));
    return parsed.success ? [parsed.data.Text] : [];
  });
  if (texts.length > 0) return normalizeText(texts.join('\n'));
  const htmls = message.html_body.flatMap((index) => {
    const parsed = htmlBody.safeParse(bodyAt(index));
    return parsed.success ? [htmlToText(parsed.data.Html)] : [];
  });
  return normalizeText(htmls.join('\n'));
}

const BLOCK_TAGS = 'p, div, li, tr, h1, h2, h3, h4, h5, h6';

/**
 * Only text leaves this function: the tree is read, never returned, and scripts and styles are dropped with their
 * contents. Passed an inert document from `parseHTML`, never the page's own.
 */
export function htmlToText(html: string): string {
  // A bare fragment parses without a body element, so it is wrapped in one. Not removing `head`: that leaves linkedom
  // without a document element and `body` then throws.
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  for (const node of document.querySelectorAll('script, style, title')) node.remove();
  for (const node of document.querySelectorAll('br')) node.replaceWith('\n');
  for (const node of document.querySelectorAll(BLOCK_TAGS)) node.append('\n');
  return document.body?.textContent ?? '';
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Keeps the answer bounded; the flag tells the reader something was cut. */
export function capText(text: string): { text: string; truncated: boolean } {
  return text.length > MAX_TEXT_CHARS
    ? { text: text.slice(0, MAX_TEXT_CHARS), truncated: true }
    : { text, truncated: false };
}
