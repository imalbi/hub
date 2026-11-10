import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EnvelopeOpenIcon, StarIcon } from '@phosphor-icons/react';
import type { inferRouterOutputs } from '@trpc/server';
import type { MailRouter } from './use-mail.ts';
import { Panel } from '../../components/panel.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { ExpandingButtonGroup } from '../../components/ui/expanding-button-group.tsx';
import { useMailTRPC } from './use-mail.ts';
import { m } from '../../paraglide/messages.js';
import { mailDate } from './mail-date.ts';

type Message = inferRouterOutputs<MailRouter>['list'][number];

export function MailReader({ account, message }: { account: string; message: Message }) {
  const trpc = useMailTRPC();
  const client = useQueryClient();
  const read = useQuery(trpc.read.queryOptions({ account, id: message.id }, { retry: false }));
  const seen = useMutation(trpc.setSeen.mutationOptions());
  const flagged = useMutation(trpc.setFlagged.mutationOptions());
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: trpc.list.queryKey() }),
      client.invalidateQueries({ queryKey: trpc.search.queryKey() }),
    ]);
  }
  return (
    <Panel
      title={message.subject}
      className="col-span-7"
      action={
        <ExpandingButtonGroup
          label={m.mail_actions()}
          items={[
            {
              id: 'seen',
              label: message.seen ? m.mail_mark_unread() : m.mail_mark_read(),
              icon: <EnvelopeOpenIcon />,
              pressed: message.seen,
              disabled: seen.isPending,
              onClick: () =>
                seen.mutate({ account, ids: [message.id], seen: !message.seen }, { onSuccess: () => void refresh() }),
            },
            {
              id: 'flagged',
              label: m.mail_star(),
              icon: <StarIcon weight={message.flagged ? 'fill' : 'regular'} />,
              pressed: message.flagged,
              disabled: flagged.isPending,
              onClick: () =>
                flagged.mutate(
                  { account, ids: [message.id], flagged: !message.flagged },
                  { onSuccess: () => void refresh() },
                ),
            },
          ]}
        />
      }
    >
      <p className="flex items-baseline justify-between gap-sm border-b border-dashed border-border pb-md">
        <span className="text-label">{message.from?.name || message.from?.email}</span>
        <span className="text-caption text-muted-foreground tabular-nums">{mailDate(message.date)}</span>
      </p>
      {(seen.isError || flagged.isError) && <p className="text-body text-danger">{m.mail_error()}</p>}
      {read.isError ? (
        <div className="flex items-center justify-between gap-md">
          <p className="text-body text-muted-foreground">{m.mail_error()}</p>
          <RegistryButton secondary label={m.mail_retry()} action={() => read.refetch()} />
        </div>
      ) : (
        <p className="max-w-prose text-body break-words whitespace-pre-wrap">{read.data?.text ?? m.tile_loading()}</p>
      )}
      {read.data?.truncated && <p className="text-caption text-muted-foreground">{m.mail_truncated()}</p>}
    </Panel>
  );
}
