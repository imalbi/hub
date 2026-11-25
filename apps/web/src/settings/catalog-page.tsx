import { CaretLeftIcon } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { Link } from '@tanstack/react-router';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useEffect, useRef, useState } from 'react';
import { Panel } from '../components/panel.tsx';
import { ActionButton } from '../components/ui/action-button.tsx';
import { EmptyState } from '../components/ui/empty-state.tsx';
import { LoadingSkeleton } from '../components/ui/loading-skeleton.tsx';
import { Input } from '../components/ui/input.tsx';
import { useTRPC } from '../lib/trpc.ts';
import { m } from '../paraglide/messages.js';
import { CatalogSource } from './catalog-source.tsx';
import { beginRestart } from './restart.ts';

export function CatalogPage() {
  const trpc = useTRPC();
  const queries = useQueryClient();
  const catalog = useQuery(trpc.catalog.state.queryOptions());
  const jobs = useSubscription({
    ...trpc.jobs.onUpdate.subscriptionOptions(),
    onData: () => void queries.invalidateQueries({ queryKey: trpc.catalog.state.queryKey() }),
  });
  const add = useMutation(trpc.catalog.addSource.mutationOptions());
  const sync = useMutation(trpc.catalog.syncSource.mutationOptions());
  const dropSource = useMutation(trpc.catalog.removeSource.mutationOptions());
  const install = useMutation(trpc.catalog.install.mutationOptions());
  const update = useMutation(trpc.catalog.update.mutationOptions());
  const remove = useMutation(trpc.catalog.remove.mutationOptions());
  const apply = useMutation(trpc.catalog.applyChanges.mutationOptions());
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState(false);
  const [error, setError] = useState(false);
  const [requested, setRequested] = useState<{ jobId: string; restarting: boolean } | null>(null);
  const handledBuild = useRef<string | null>(null);
  const build = jobs.data?.find((job) => job.action === 'catalog.build') ?? catalog.data?.buildJob;
  const building = build?.status === 'queued' || build?.status === 'running';
  const failed = build && build.status !== 'completed' && !building;
  const busy =
    building ||
    add.isPending ||
    sync.isPending ||
    dropSource.isPending ||
    install.isPending ||
    update.isPending ||
    remove.isPending ||
    apply.isPending;

  const manual =
    requested?.jobId === build?.id &&
    requested?.restarting === false &&
    build?.status === 'completed' &&
    build.exitCode === 0;

  useEffect(() => {
    if (!requested || build?.id !== requested.jobId || building || handledBuild.current === build.id) return;
    if (build.status !== 'completed' || build.exitCode !== 0) return;
    handledBuild.current = build.id;
    void queries.invalidateQueries({ queryKey: trpc.catalog.state.queryKey() });
    if (requested.restarting) beginRestart(queries);
  }, [requested, build, building, queries, trpc]);

  async function change(action: () => Promise<unknown>) {
    setError(false);
    setRequested(null);
    try {
      await action();
    } catch (cause) {
      setError(true);
      throw cause;
    } finally {
      await queries.invalidateQueries({ queryKey: trpc.catalog.state.queryKey() });
    }
  }

  async function addRepository() {
    setUrlError(false);
    setError(false);
    try {
      await add.mutateAsync({ url });
      setUrl('');
      await queries.invalidateQueries({ queryKey: trpc.catalog.state.queryKey() });
    } catch (cause) {
      if (cause instanceof TRPCClientError && cause.message === 'Invalid Git repository URL') setUrlError(true);
      else setError(true);
      throw cause;
    }
  }

  return (
    <div className="flex flex-col gap-lg">
      <Link to="/desk/settings" className="inline-flex w-fit items-center gap-2xs text-label text-muted-foreground">
        <CaretLeftIcon aria-hidden className="size-icon-sm" />
        {m.settings_back()}
      </Link>
      <div className="sticky top-0 z-10 -my-xs flex flex-wrap items-center gap-lg bg-surface py-xs">
        <h2 className="text-heading">{m.catalog_title()}</h2>
      </div>
      {(catalog.data?.pendingApply || building || failed) && (
        <Panel title={building ? m.catalog_building() : m.catalog_pending()}>
          <p
            role={failed ? 'alert' : undefined}
            className={`text-body ${failed ? 'text-danger' : 'text-muted-foreground'}`}
          >
            {failed ? m.catalog_build_failed() : m.catalog_pending_text()}
          </p>
          <div className="flex flex-wrap items-center gap-md">
            <ActionButton
              disabled={busy}
              action={async () => {
                setRequested(null);
                setRequested(await apply.mutateAsync());
              }}
              onError={() => setError(true)}
              labels={{ pending: m.action_pending(), success: m.action_done(), error: m.catalog_retry() }}
            >
              {m.catalog_apply()}
            </ActionButton>
            {build && (
              <Link
                to="/desk/system"
                search={{ tab: 'jobs' }}
                className="text-label text-muted-foreground underline underline-offset-4"
              >
                {m.catalog_activity()}
              </Link>
            )}
          </div>
        </Panel>
      )}
      {manual && <output className="text-body text-muted-foreground">{m.catalog_manual_restart()}</output>}
      {error && (
        <p role="alert" className="text-body text-danger">
          {m.catalog_error()}
        </p>
      )}
      {catalog.isError && (
        <EmptyState
          variant="inline"
          title={m.catalog_load_error()}
          action={{
            label: m.catalog_retry(),
            onAction: () => catalog.refetch(),
            pendingLabel: m.action_pending(),
            successLabel: m.action_done(),
            errorLabel: m.catalog_retry(),
          }}
        />
      )}
      <Panel title={m.catalog_add_title()}>
        <p className="max-w-prose text-body text-muted-foreground">{m.catalog_trust()}</p>
        <form
          className="flex flex-wrap items-end gap-md"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && url.trim()) void addRepository().catch(() => undefined);
          }}
        >
          <Input
            label={m.catalog_url()}
            value={url}
            onValueChange={(value) => {
              setUrl(value);
              setUrlError(false);
            }}
            error={urlError ? m.catalog_invalid_url() : undefined}
            className="min-w-0 flex-1"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
          <ActionButton
            disabled={busy || !url.trim()}
            action={addRepository}
            labels={{ pending: m.action_pending(), success: m.action_done(), error: m.catalog_retry() }}
          >
            {m.catalog_add()}
          </ActionButton>
        </form>
      </Panel>
      {catalog.isPending && <LoadingSkeleton label={m.settings_loading()} />}
      {catalog.data?.sources.length === 0 && (
        <EmptyState variant="compact" title={m.catalog_empty()} description={m.catalog_empty_text()} />
      )}
      {catalog.data?.sources.map((source) => (
        <CatalogSource
          key={source.id}
          source={source}
          busy={busy}
          installed={catalog.data.installed}
          sync={() =>
            change(async () => {
              const result = await sync.mutateAsync({ id: source.id });
              if (!result.ok) throw new Error('Catalog sync failed');
            })
          }
          removeSource={() => change(() => dropSource.mutateAsync({ id: source.id, confirmed: true }))}
          install={(name) => change(() => install.mutateAsync({ sourceId: source.id, name, confirmed: true }))}
          update={(name) => change(() => update.mutateAsync({ name, confirmed: true }))}
          remove={(name) => change(() => remove.mutateAsync({ name, confirmed: true }))}
        />
      ))}
    </div>
  );
}
