import { useQuery } from '@tanstack/react-query';
import type { inferRouterInputs } from '@trpc/server';
import type { MailRouter } from './use-mail.ts';
import { useState } from 'react';
import { StarIcon } from '@phosphor-icons/react';
import { Panel } from '../../components/panel.tsx';
import { Select } from '../../components/ui/select.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { m } from '../../paraglide/messages.js';
import { useMail, useMailTRPC } from './use-mail.ts';
import { SearchForm } from './search-form.tsx';
import { MailReader } from './reader.tsx';
import { mailDate } from './mail-date.ts';

type Filter = inferRouterInputs<MailRouter>['search']['filter'];

export function PostaSection() {
  const trpc = useMailTRPC();
  const mail = useMail();
  const [chosen, setChosen] = useState('');
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState<Filter | null>(null);
  const [page, setPage] = useState(1);
  const accounts = mail.data?.accounts ?? [];
  const account = accounts.find((item) => item.account === chosen)?.account ?? accounts[0]?.account ?? '';
  const list = useQuery(trpc.list.queryOptions({ account, page }, { enabled: !!account && !filter, retry: false }));
  const search = useQuery(
    trpc.search.queryOptions({ account, filter: filter ?? {}, page }, { enabled: !!account && !!filter, retry: false }),
  );
  const result = filter ? search : list;
  const selectedMessage = result.data?.find((message) => message.id === selected);
  return (
    <div className="flex flex-col gap-lg">
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
      <div className="grid grid-cols-12 items-start gap-lg">
        <Panel title={m.mail_inbox()} className="col-span-5">
          {result.isError && (
            <div className="flex items-center justify-between gap-md">
              <p className="text-body text-muted-foreground">{m.mail_error()}</p>
              <RegistryButton secondary label={m.mail_retry()} action={() => result.refetch()} />
            </div>
          )}
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
        {selectedMessage ? (
          <MailReader account={account} message={selectedMessage} />
        ) : (
          <Panel className="col-span-7">
            <p className="text-body text-muted-foreground">{m.mail_pick()}</p>
          </Panel>
        )}
      </div>
    </div>
  );
}
