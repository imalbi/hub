import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveIcon, EnvelopeOpenIcon, StarIcon } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { Panel } from '../../components/panel.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { m } from '../../paraglide/messages.js';
import { mailDate } from './mail-date.ts';
import { ReplyForm } from './reply-form.tsx';
import { useMailTRPC, type InboxRow } from './use-mail.ts';

const ICON_BUTTON =
  'flex size-touch cursor-pointer items-center justify-center rounded-full border border-border hover:bg-surface focus-visible:outline focus-visible:outline-accent disabled:opacity-50';

export function MailReader({
  message,
  accountLabel,
  onArchive,
  onSent,
}: {
  message: InboxRow;
  accountLabel: string;
  onArchive: () => Promise<unknown>;
  onSent: () => void;
}) {
  const trpc = useMailTRPC();
  const client = useQueryClient();
  const { account } = message;
  const read = useQuery(trpc.read.queryOptions({ account, id: message.id }, { retry: false }));
  const seen = useMutation(trpc.setSeen.mutationOptions());
  const flagged = useMutation(trpc.setFlagged.mutationOptions());
  const [replying, setReplying] = useState(false);
  const [sent, setSent] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: trpc.inbox.pathKey() });
  const sender = message.from?.name || message.from?.email;
  return (
    <Panel
      title={message.subject}
      subtitle={[sender, mailDate(message.date), accountLabel].filter(Boolean).join(' · ')}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-xl"
      action={
        replying ? undefined : (
          <div className="flex shrink-0 items-center gap-xs">
            <button
              type="button"
              aria-label={message.seen ? m.mail_mark_unread() : m.mail_mark_read()}
              aria-pressed={message.seen}
              disabled={seen.isPending}
              className={ICON_BUTTON}
              onClick={() =>
                seen.mutate({ account, ids: [message.id], seen: !message.seen }, { onSuccess: () => void refresh() })
              }
            >
              <EnvelopeOpenIcon aria-hidden weight={message.seen ? 'fill' : 'regular'} className="size-icon-sm" />
            </button>
            <button
              type="button"
              aria-label={m.mail_star()}
              aria-pressed={message.flagged}
              disabled={flagged.isPending}
              className={ICON_BUTTON}
              onClick={() =>
                flagged.mutate(
                  { account, ids: [message.id], flagged: !message.flagged },
                  { onSuccess: () => void refresh() },
                )
              }
            >
              <StarIcon aria-hidden weight={message.flagged ? 'fill' : 'regular'} className="size-icon-sm" />
            </button>
            <RegistryButton
              secondary
              iconOnly
              label={m.mail_archive()}
              icon={<ArchiveIcon aria-hidden />}
              action={onArchive}
            />
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setReplying(true);
              }}
              className="min-h-touch cursor-pointer rounded-full bg-primary px-lg text-label font-medium text-primary-foreground focus-visible:outline focus-visible:outline-accent"
            >
              {m.mail_reply()}
            </button>
          </div>
        )
      }
    >
      <hr className="border-t border-border" />
      {(seen.isError || flagged.isError) && <p className="text-body text-danger">{m.mail_error()}</p>}
      {sent && <output className="text-body text-muted-foreground">{m.mail_sent_line()}</output>}
      {replying ? (
        <Reply preview={read.data?.text}>
          <ReplyForm
            account={account}
            accountLabel={accountLabel}
            id={message.id}
            onClose={() => setReplying(false)}
            onSent={() => {
              setReplying(false);
              setSent(true);
              onSent();
            }}
          />
        </Reply>
      ) : read.isError ? (
        <div className="flex items-center justify-between gap-md">
          <p className="text-body text-muted-foreground">{m.mail_error()}</p>
          <RegistryButton secondary label={m.mail_retry()} action={() => read.refetch()} />
        </div>
      ) : (
        <p className="max-w-prose text-body break-words whitespace-pre-wrap">{read.data?.text ?? m.tile_loading()}</p>
      )}
      {!replying && read.data?.truncated && <p className="text-caption text-muted-foreground">{m.mail_truncated()}</p>}
    </Panel>
  );
}

/** The message shrinks to one line above its reply form. */
function Reply({ preview, children }: { preview: string | undefined; children: ReactNode }) {
  return (
    <>
      <p className="truncate text-body text-muted-foreground">{preview?.replace(/\s+/g, ' ')}</p>
      {children}
    </>
  );
}
