import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { RunResult } from '../core/exec.ts';
import { ENVELOPE_SCHEMA_ARGS, envelopeSchema, messageViewSchema, VERSION_ARGS } from '../modules/mail/himalaya.ts';

// Invented accounts and messages (example.org only); the shapes are those `himalaya --json` prints.
const accounts = z
  .record(z.string(), z.record(z.string(), z.array(envelopeSchema)))
  .parse(JSON.parse(readFileSync(new URL('../modules/mail/fixtures/accounts.json', import.meta.url), 'utf8')));
const messages = z
  .record(z.string(), messageViewSchema)
  .parse(JSON.parse(readFileSync(new URL('../modules/mail/fixtures/messages.json', import.meta.url), 'utf8')));
const schemaText = readFileSync(new URL('../modules/mail/fixtures/envelope-list.schema.json', import.meta.url), 'utf8');

type Envelope = z.output<typeof envelopeSchema>;
type Row = Omit<Envelope, 'flags'> & { account: string; flags: Set<string> };
type Predicate = (row: Row) => boolean;

const ok = (stdout: string): RunResult => ({ stdout, stderr: '', code: 0 });
const refused: RunResult = { stdout: '', stderr: 'fake desktop: himalaya command not supported', code: 127 };
const VALUE_OPTIONS = new Set(['-m', '-p', '-s', '-f']);
// A word, or a double-quoted value with `\` escapes: the forms Hub's query builder produces.
const TOKEN = /"((?:\\.|[^"\\])*)"|(\S+)/g;

type Word = { text: string; quoted: boolean };

/** The fixture's flags as himalaya names them, the way `flag add` and `flag remove` change them. */
function createFlags(): Map<string, Set<string>> {
  const flags = new Map<string, Set<string>>();
  for (const [account, mailboxes] of Object.entries(accounts)) {
    for (const envelopes of Object.values(mailboxes)) {
      for (const envelope of envelopes) {
        flags.set(`${account}/${envelope.id}`, new Set(envelope.flags.map((flag) => flag.iana ?? flag.raw)));
      }
    }
  }
  return flags;
}

function rowsOf(account: string, mailbox: string, flags: Map<string, Set<string>>): Row[] | null {
  const envelopes = accounts[account]?.[mailbox];
  if (!envelopes) return null;
  return envelopes.map((envelope) => ({
    ...envelope,
    account,
    flags: flags.get(`${account}/${envelope.id}`) ?? new Set(),
  }));
}

function toEnvelope(row: Row): Envelope {
  const { account: _account, flags, ...rest } = row;
  return {
    ...rest,
    flags: [...flags].map((name) => ({ raw: `\\${name[0]?.toUpperCase()}${name.slice(1)}`, iana: name })),
  };
}

function words(query: readonly string[]): Word[] {
  return [...query.join(' ').matchAll(TOKEN)].map((match) =>
    match[1] === undefined
      ? { text: match[2] ?? '', quoted: false }
      : { text: match[1].replace(/\\(.)/g, '$1'), quoted: true },
  );
}

function predicateFor(key: string, value: string): Predicate | null {
  const lower = value.toLowerCase();
  if (key === 'from')
    return (row) => row.from.some((a) => `${a.name ?? ''} ${a.email ?? ''}`.toLowerCase().includes(lower));
  if (key === 'subject') return (row) => row.subject.toLowerCase().includes(lower);
  if (key === 'body')
    return (row) =>
      JSON.stringify(messages[`${row.account}/${row.id}`]?.parts ?? [])
        .toLowerCase()
        .includes(lower);
  if (key === 'after' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    // himalaya's `after` leaves out the named day itself.
    return (row) => (row.date ?? '').slice(0, 10) > value;
  if (key === 'flag' && (value === 'seen' || value === 'flagged')) return (row) => row.flags.has(value);
  return null;
}

/** `term and term`, each term `[not] key value`; anything else is null, which the fake refuses. */
function parseQuery(query: readonly string[]): Predicate[] | null {
  const tokens = words(query);
  const predicates: Predicate[] = [];
  let index = 0;
  while (index < tokens.length) {
    if (predicates.length > 0) {
      if (tokens[index]?.text !== 'and' || tokens[index]?.quoted) return null;
      index++;
    }
    const negated = tokens[index]?.text === 'not' && !tokens[index]?.quoted;
    if (negated) index++;
    const key = tokens[index];
    const value = tokens[index + 1];
    if (!key || key.quoted || !value) return null;
    const predicate = predicateFor(key.text, value.text);
    if (!predicate) return null;
    predicates.push(negated ? (row) => !predicate(row) : predicate);
    index += 2;
  }
  return predicates.length > 0 ? predicates : null;
}

/** Options with a value, plus positional words. Any other option (such as `--seen`) is not known here. */
function split(args: readonly string[]): { options: Map<string, string>; positional: string[] } | null {
  const options = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? '';
    if (arg.startsWith('-')) {
      if (!VALUE_OPTIONS.has(arg) || args[index + 1] === undefined) return null;
      options.set(arg, args[index + 1] ?? '');
      index++;
    } else {
      positional.push(arg);
    }
  }
  return { options, positional };
}

function page(rows: readonly Row[], pageNumber: number, size: number) {
  const start = (pageNumber - 1) * size;
  return rows.slice(start, start + size).map(toEnvelope);
}

function newestFirst(rows: Row[]): Row[] {
  return rows.toSorted((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

/**
 * The answer to one `himalaya` call, for the exact argv Hub builds. Flag changes are kept per desktop, so a test sees
 * its own `flag add` in the next listing. Anything else is refused: a command Hub never sends must fail the test.
 */
export function createFakeHimalaya(): (args: readonly string[]) => RunResult {
  const flags = createFlags();

  return (args) => {
    if (args.length === 1 && args[0] === VERSION_ARGS[0]) return ok('himalaya v2.2.1 (fake)\n');
    if (args.join(' ') === ENVELOPE_SCHEMA_ARGS.join(' ')) return ok(schemaText);
    if (args[0] !== '--json' || args[1] !== '-a' || args[2] === undefined) return refused;
    const account = args[2];
    const rest = args.slice(3);
    const [group, action] = rest;
    const parsed = split(rest.slice(2));
    if (!parsed || !(account in accounts)) return refused;
    const { options, positional } = parsed;

    if (group === 'envelope' && (action === 'list' || action === 'search')) {
      const mailbox = options.get('-m') ?? 'INBOX';
      const pageNumber = Number(options.get('-p') ?? 1);
      const size = Number(options.get('-s') ?? 25);
      const all = rowsOf(account, mailbox, flags);
      if (!all) return refused;
      const predicates = action === 'search' ? parseQuery(positional) : [];
      if (!predicates) return refused;
      const matched = newestFirst(all.filter((row) => predicates.every((predicate) => predicate(row))));
      return ok(JSON.stringify({ queued: 0, envelopes: page(matched, pageNumber, size) }));
    }

    if (group === 'message' && action === 'read') {
      const id = positional[0];
      const view = id ? messages[`${account}/${id}`] : undefined;
      return view && positional.length === 1 ? ok(JSON.stringify(view)) : refused;
    }

    if (group === 'flag' && (action === 'add' || action === 'remove')) {
      const flag = options.get('-f');
      const mailbox = options.get('-m') ?? 'INBOX';
      const inbox = rowsOf(account, mailbox, flags);
      if (!inbox || mailbox !== 'INBOX' || (flag !== 'seen' && flag !== 'flagged') || positional.length === 0)
        return refused;
      for (const id of positional) {
        if (!inbox.some((row) => row.id === id)) return refused;
      }
      for (const id of positional) {
        const set = flags.get(`${account}/${id}`) ?? new Set<string>();
        if (action === 'add') set.add(flag);
        else set.delete(flag);
        flags.set(`${account}/${id}`, set);
      }
      return ok(JSON.stringify({ flags: [flag] }));
    }

    return refused;
  };
}
