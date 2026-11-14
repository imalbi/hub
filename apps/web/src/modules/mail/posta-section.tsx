import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ButtonGroup } from '../../components/ui/button-group.tsx';
import { m } from '../../paraglide/messages.js';
import { TabBarActions } from '../../shell/header-slot.tsx';
import { ComposeForm } from './compose.tsx';
import { InboxList, rowKey } from './inbox-list.tsx';
import { MailReader } from './reader.tsx';
import { useMail, useMailAccounts, useMailTRPC, type InboxRow, type MailFilter } from './use-mail.ts';

const ALL = 'all';
const UNDO_MS = 8000;
type Archived = { account: string; messageId: string; subject: string };

export function PostaSection() {
  const trpc = useMailTRPC();
  const mail = useMail();
  const mailAccounts = useMailAccounts();
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState(ALL);
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState<MailFilter>({});
  const [composing, setComposing] = useState(false);
  const [archived, setArchived] = useState<Archived | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The configured accounts come from the config at once; the live state reads every mailbox and comes later.
  const accounts = mailAccounts.data ?? mail.data?.accounts ?? [];
  const labels = new Map(accounts.map((item) => [item.account, item.label]));
  const merged = accounts.length > 1;
  const account =
    merged && chosen === ALL ? undefined : (accounts.find((item) => item.account === chosen) ?? accounts[0])?.account;
  // Reopening Posta shows the last list at once and reads the mailbox again only after a minute; new mail also
  // arrives through the live state and the refresh button.
  const inbox = useInfiniteQuery(
    trpc.inbox.infiniteQueryOptions(
      { account, filter },
      {
        enabled: accounts.length > 0,
        getNextPageParam: (last) => last.cursor ?? undefined,
        retry: false,
        staleTime: 60_000,
        gcTime: 30 * 60_000,
      },
    ),
  );
  const rows = inbox.data?.pages.flatMap((page) => page.rows) ?? [];
  const selectedRow = rows.find((row) => rowKey(row) === selected);
  const seen = useMutation(trpc.setSeen.mutationOptions());
  const archive = useMutation(trpc.archive.mutationOptions());
  const unarchive = useMutation(trpc.unarchive.mutationOptions());
  const reload = () => queryClient.invalidateQueries({ queryKey: trpc.inbox.pathKey() });

  async function archiveRow(row: InboxRow) {
    await archive.mutateAsync({ account: row.account, id: row.id });
    if (rowKey(row) === selected) setSelected('');
    clearTimeout(undoTimer.current);
    setArchived(row.messageId ? { account: row.account, messageId: row.messageId, subject: row.subject } : null);
    undoTimer.current = setTimeout(() => setArchived(null), UNDO_MS);
    await reload();
  }
  async function undoArchive(last: Archived) {
    setArchived(null);
    await unarchive.mutateAsync(last);
    await reload();
  }
  // Aggiorna starts over from the first page, like a new search, instead of rereading every page loaded.
  async function refresh() {
    queryClient.setQueryData(trpc.inbox.infiniteQueryKey({ account, filter }), (data) =>
      data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data,
    );
    await Promise.all([inbox.refetch(), queryClient.fetchQuery(trpc.refresh.queryOptions({}))]);
  }
  const pick = (next: string) => {
    setChosen(next);
    setSelected('');
  };
  return (
    <>
      <TabBarActions>
        {merged && (
          <ButtonGroup
            label={m.mail_account()}
            size="md"
            items={[
              { id: ALL, label: m.mail_all(), active: !account, onClick: () => pick(ALL) },
              ...accounts.map((item) => ({
                id: item.account,
                label: item.label,
                active: account === item.account,
                onClick: () => pick(item.account),
              })),
            ]}
          />
        )}
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="ml-auto min-h-touch cursor-pointer rounded-full bg-primary px-lg text-label font-medium text-primary-foreground focus-visible:outline focus-visible:outline-accent"
        >
          {m.mail_write()}
        </button>
      </TabBarActions>
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-lg">
        <div className="col-span-4 flex min-h-0 flex-col">
          <InboxList
            status={{
              rows,
              pending: inbox.isPending && !inbox.isError,
              error: inbox.isError,
              hasMore: inbox.hasNextPage,
              loadingMore: inbox.isFetchingNextPage,
              loadMore: () => void inbox.fetchNextPage(),
              retry: () => inbox.refetch(),
              refresh,
            }}
            filter={filter}
            scope={`${account}|${JSON.stringify(filter)}`}
            onFilter={(next) => {
              setFilter(next);
              setSelected('');
            }}
            labels={labels}
            showAccount={!account}
            selected={selected}
            onSelect={(row) => {
              setSelected(rowKey(row));
              setComposing(false);
            }}
            onToggleSeen={(row) =>
              seen.mutate({ account: row.account, ids: [row.id], seen: !row.seen }, { onSuccess: () => void reload() })
            }
            onArchive={(row) => void archiveRow(row).catch(() => undefined)}
          />
        </div>
        <div className="col-span-8 flex min-h-0 flex-col">
          {composing ? (
            <ComposePanel
              accounts={accounts}
              defaultAccount={account ?? accounts[0]?.account ?? ''}
              onClose={() => setComposing(false)}
              onSent={() => {
                setComposing(false);
                void reload();
              }}
            />
          ) : selectedRow ? (
            <MailReader
              key={rowKey(selectedRow)}
              message={selectedRow}
              accountLabel={labels.get(selectedRow.account) ?? ''}
              onArchive={() => archiveRow(selectedRow)}
              onSent={() => void reload()}
            />
          ) : (
            <div data-panel="" className="flex min-h-0 flex-1 items-center justify-center rounded-lg bg-muted p-lg">
              <p className="text-body text-muted-foreground">{m.mail_pick()}</p>
            </div>
          )}
        </div>
      </div>
      {archived && (
        <output className="fixed bottom-xl left-1/2 z-50 flex h-touch -translate-x-1/2 items-center gap-md rounded-full border border-border bg-surface-raised pr-xs pl-lg text-label">
          {m.mail_archived()}
          <button
            type="button"
            onClick={() => void undoArchive(archived).catch(() => undefined)}
            className="min-h-xl cursor-pointer rounded-full bg-foreground px-md text-caption font-medium text-background"
          >
            {m.mail_undo()}
          </button>
        </output>
      )}
      {(archive.isError || unarchive.isError) && (
        <p role="alert" className="text-body text-danger">
          {archive.isError ? m.mail_archive_error() : m.mail_unarchive_error()}
        </p>
      )}
    </>
  );
}

function ComposePanel(props: React.ComponentProps<typeof ComposeForm>) {
  return (
    <div data-panel="" className="flex min-h-0 flex-1 flex-col rounded-lg bg-muted p-lg">
      <ComposeForm {...props} />
    </div>
  );
}
