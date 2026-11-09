import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Run } from '../../core/exec.ts';
import { protectedProcedure, router } from '../../core/trpc.ts';
import type { MailAccount } from './config.ts';
import { readMailState, type MailLive } from './live.ts';
import {
  capText,
  filterSchema,
  envelopesSchema,
  flagArgs,
  flagResultSchema,
  himalaya,
  idSchema,
  listArgs,
  mailboxSchema,
  messageViewSchema,
  PAGE_SIZE,
  plainTextOf,
  readArgs,
  searchArgs,
  THREAD_WINDOW,
  toMessage,
  type MailFailure,
  type MailResult,
} from './himalaya.ts';
import { threadOf, type ThreadEntry, type ThreadView } from './thread.ts';

// Messages are never inbox-only for threads: the sent mailbox is the owner's side of the conversation.
const SENT = 'sent';
const INBOX = 'INBOX';
const MAX_IDS = 50;

// Each failure reads the same to the owner whatever himalaya said: no address, subject or body in the message.
function unwrap<T>(result: MailResult<T>): T {
  if (result.ok) return result.value;
  const errors: Record<MailFailure, TRPCError> = {
    timeout: new TRPCError({ code: 'TIMEOUT', message: 'The mail account did not answer in time' }),
    failed: new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'The mail account is not available' }),
    unreadable: new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'The mail account answered unexpectedly' }),
  };
  throw errors[result.failure];
}

/** Hub answers only for accounts in its own config; a name from the client is never passed to himalaya unchecked. */
function findAccount(accounts: readonly MailAccount[], name: string): MailAccount {
  const found = accounts.find((item) => item.account === name);
  if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'Mail account not configured' });
  return found;
}

const accountInput = z.string().min(1).max(60);
const pageInput = z.number().int().min(1).max(500).default(1);

/** Threads are built per account from both mailboxes; the window starts the day before `days` ago (`after` excludes its day). */
function windowStart(days: number, now: Date): string {
  return new Date(now.getTime() - (days + 1) * 86_400_000).toISOString().slice(0, 10);
}

async function listThreadEntries(
  run: Run,
  account: string,
  after: string,
): Promise<{ entries: ThreadEntry[]; truncated: boolean }> {
  const fetchSide = async (mailbox: string, side: 'inbox' | 'sent') => {
    const result = await himalaya(run, searchArgs(account, mailbox, 1, THREAD_WINDOW, { after }), envelopesSchema);
    const { envelopes } = unwrap(result);
    const entries = envelopes.map((envelope): ThreadEntry => {
      const message = toMessage(envelope);
      return {
        mailbox: side,
        id: message.id,
        messageId: message.messageId,
        inReplyTo: envelope['in-reply-to'],
        subject: message.subject,
        date: message.date,
      };
    });
    return { entries, truncated: envelopes.length >= THREAD_WINDOW };
  };
  const [inbox, sent] = await Promise.all([fetchSide(INBOX, 'inbox'), fetchSide(SENT, 'sent')]);
  return { entries: [...inbox.entries, ...sent.entries], truncated: inbox.truncated || sent.truncated };
}

export type ThreadAnswer = { account: string; messageId: string; thread: ThreadView | null };

export function createMailRouter({
  run,
  accounts,
  live,
}: {
  run: Run;
  accounts: readonly MailAccount[];
  live: MailLive;
}) {
  const setFlag = (account: string, flag: 'seen' | 'flagged', ids: readonly string[], add: boolean) =>
    himalaya(run, flagArgs(account, INBOX, add, flag, ids), flagResultSchema);

  return router({
    state: protectedProcedure.query(() => readMailState(run, accounts)),
    onState: protectedProcedure.subscription(({ signal }) => live.subscribe(signal)),

    list: protectedProcedure
      .input(z.object({ account: accountInput, mailbox: mailboxSchema.default(INBOX), page: pageInput }))
      .query(async ({ input }) => {
        const { account } = findAccount(accounts, input.account);
        const { envelopes } = unwrap(
          await himalaya(run, listArgs(account, input.mailbox, input.page, PAGE_SIZE), envelopesSchema),
        );
        return envelopes.map(toMessage);
      }),

    search: protectedProcedure
      .input(z.object({ account: accountInput, filter: filterSchema, page: pageInput }))
      .query(async ({ input }) => {
        const { account } = findAccount(accounts, input.account);
        const { envelopes } = unwrap(
          await himalaya(run, searchArgs(account, INBOX, input.page, PAGE_SIZE, input.filter), envelopesSchema),
        );
        return envelopes.map(toMessage);
      }),

    // Never `--seen`: opening a message leaves it unread until the owner marks it.
    read: protectedProcedure
      .input(z.object({ account: accountInput, id: idSchema, mailbox: mailboxSchema.default(INBOX) }))
      .query(async ({ input }) => {
        const { account } = findAccount(accounts, input.account);
        const view = unwrap(await himalaya(run, readArgs(account, input.mailbox, input.id), messageViewSchema));
        return { id: input.id, ...capText(plainTextOf(view)) };
      }),

    threads: protectedProcedure
      .input(
        z.object({
          links: z
            .array(z.object({ account: accountInput, messageId: z.string().min(1).max(320) }))
            .min(1)
            .max(50),
          days: z.number().int().min(1).max(365).default(60),
        }),
      )
      .query(async ({ input }) => {
        const after = windowStart(input.days, new Date());
        const accountNames = [...new Set(input.links.map((link) => link.account))];
        const sides = await Promise.all(
          accountNames.map(async (name) => {
            const { account } = findAccount(accounts, name);
            return [name, await listThreadEntries(run, account, after)] as const;
          }),
        );
        const byAccount = new Map(sides);
        const answers: ThreadAnswer[] = input.links.map((link) => ({
          account: link.account,
          messageId: link.messageId,
          thread: threadOf(byAccount.get(link.account)?.entries ?? [], link.messageId),
        }));
        const truncated = sides.some(([, side]) => side.truncated);
        return { threads: answers, truncated, after };
      }),

    setSeen: protectedProcedure
      .meta({
        label: 'Segna come letta',
        description:
          'Mark mail messages in the inbox of one configured account as read, or as unread when seen is false',
      })
      .input(z.object({ account: accountInput, ids: z.array(idSchema).min(1).max(MAX_IDS), seen: z.boolean() }))
      .mutation(async ({ input }) => {
        const { account } = findAccount(accounts, input.account);
        unwrap(await setFlag(account, 'seen', input.ids, input.seen));
        void live.notify();
      }),

    setFlagged: protectedProcedure
      .meta({
        label: 'Contrassegna',
        description: 'Star or unstar mail messages in the inbox of one configured account (the flagged flag)',
      })
      .input(z.object({ account: accountInput, ids: z.array(idSchema).min(1).max(MAX_IDS), flagged: z.boolean() }))
      .mutation(async ({ input }) => {
        const { account } = findAccount(accounts, input.account);
        unwrap(await setFlag(account, 'flagged', input.ids, input.flagged));
        void live.notify();
      }),
  });
}
