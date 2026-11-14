import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { inferRouterInputs } from '@trpc/server';
import type { MailRouter } from './use-mail.ts';
import { useState } from 'react';
import { StarIcon } from '@phosphor-icons/react';
import { Panel } from '../../components/panel.tsx';
import { Select } from '../../components/ui/select.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { m } from '../../paraglide/messages.js';
import { useMail, useMailAccounts, useMailTRPC } from './use-mail.ts';
import { SearchForm } from './search-form.tsx';
import { MailReader } from './reader.tsx';
import { mailDate } from './mail-date.ts';

type Filter = inferRouterInputs<MailRouter>['search']['filter'];

export function PostaSection() {
  const trpc = useMailTRPC();
  const mail = useMail();
  const mailAccounts = useMailAccounts();
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState('');
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState<Filter | null>(null);
  const [page, setPage] = useState(1);
  // The configured accounts come from the config at once; the live state reads every mailbox and comes later.
  const accounts = mailAccounts.data ?? mail.data?.accounts ?? [];
  const account = accounts.find((item) => item.account === chosen)?.account ?? accounts[0]?.account ?? '';
  // Reopening Posta shows the last list at once and reads the mailbox again only after a minute; new mail also
  // arrives through the live state and the refresh button.
  const cached = { retry: false, staleTime: 60_000, gcTime: 30 * 60_000 } as const;
  const list = useQuery(trpc.list.queryOptions({ account, page }, { enabled: !!account && !filter, ...cached }));
  const search = useQuery(
    trpc.search.queryOptions({ account, filter: filter ?? {}, page }, { enabled: !!account && !!filter, ...cached }),
  );
  const result = filter ? search : list;
  const selectedMessage = result.data?.find((message) => message.id === selected);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-lg">
      <SearchForm
        leading={
          <Select
            label={m.mail_account()}
            options={accounts.map((item) => ({ value: item.account, label: item.label }))}
            value={account}
            onValueChange={(value) => {
              setChosen(value);
              setSelected('');
              setPage(1);
            }}
          />
        }
        onSearch={(value) => {
          setFilter(value);
          setSelected('');
          setPage(1);
        }}
      />
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-lg pb-xl">
        <Panel
          title={m.mail_inbox()}
          className="col-span-5 min-h-0"
          action={
            <RegistryButton
              secondary
              label={m.mail_refresh()}
              action={async () => {
                await Promise.all([
                  result.refetch(),
                  mailAccounts.refetch(),
                  queryClient.fetchQuery(trpc.refresh.queryOptions({})),
                ]);
              }}
            />
          }
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {result.isError && (
              <div className="flex items-center justify-between gap-md">
                <p className="text-body text-muted-foreground">{m.mail_error()}</p>
                <RegistryButton secondary label={m.mail_retry()} action={() => result.refetch()} />
              </div>
            )}
            {!result.data && result.isPending && <ListSkeleton />}
            {result.data?.length === 0 && <p className="text-body text-muted-foreground">{m.mail_empty()}</p>}
            <ul className="flex flex-col">
              {result.data?.map((message) => (
                <li key={message.id} className="border-b border-dashed border-border last:border-b-0">
                  <button
                    type="button"
                    aria-pressed={selected === message.id}
                    onClick={() => setSelected(message.id)}
                    className={`my-3xs flex w-full items-start gap-sm rounded-lg p-sm text-left ${selected === message.id ? 'bg-muted' : 'hover:bg-muted/50'}`}
                  >
                    <span
                      aria-hidden
                      className={`mt-xs size-xs shrink-0 rounded-full ${message.seen ? '' : 'bg-primary'}`}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-3xs">
                      <span className="flex items-baseline justify-between gap-sm">
                        <span className={`truncate text-label ${message.seen ? 'text-muted-foreground' : ''}`}>
                          {message.from?.name || message.from?.email}
                        </span>
                        <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
                          {mailDate(message.date)}
                        </span>
                      </span>
                      <span
                        className={`flex items-center gap-xs text-body ${message.seen ? 'text-muted-foreground' : ''}`}
                      >
                        <span className="truncate">{message.subject}</span>
                        {message.flagged && (
                          <>
                            <StarIcon aria-hidden weight="fill" className="size-icon-sm shrink-0" />
                            <span className="sr-only"> {m.mail_starred()}</span>
                          </>
                        )}
                      </span>
                    </span>
                    {!message.seen && <span className="sr-only"> {m.mail_unread()}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-xs">
            <RegistryButton
              secondary
              label={m.mail_previous()}
              disabled={page === 1}
              action={async () => {
                setPage(page - 1);
                setSelected('');
              }}
            />
            <RegistryButton
              secondary
              label={m.mail_next()}
              disabled={(result.data?.length ?? 0) < 25}
              action={async () => {
                setPage(page + 1);
                setSelected('');
              }}
            />
          </div>
        </Panel>
        <div className="col-span-7 min-h-0 overflow-y-auto overscroll-contain">
          {selectedMessage ? (
            <MailReader account={account} message={selectedMessage} />
          ) : (
            <Panel className="col-span-7">
              <p className="text-body text-muted-foreground">{m.mail_pick()}</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

/** Placeholder rows shaped like the messages, so the list does not jump when it arrives. */
function ListSkeleton() {
  return (
    <output aria-label={m.mail_loading()} className="flex flex-col">
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <span
          key={row}
          aria-hidden
          className="flex flex-col gap-xs border-b border-dashed border-border p-sm last:border-b-0 motion-safe:animate-pulse"
        >
          <span className="flex justify-between gap-sm">
            <span className="h-sm w-1/3 rounded-full bg-muted" />
            <span className="h-sm w-xl rounded-full bg-muted" />
          </span>
          <span className="h-sm w-2/3 rounded-full bg-muted" />
        </span>
      ))}
    </output>
  );
}
