import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Panel } from '../components/panel.tsx';
import { LoadingSkeleton } from '../components/ui/loading-skeleton.tsx';
import { useConnectionLost, useTRPC } from '../lib/trpc.ts';
import { m } from '../paraglide/messages.js';

const time = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });

export function BriefWidget() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const latest = useQuery(trpc.brief.latest.queryOptions());
  const lost = useConnectionLost();
  const options = {
    onSuccess: async (data: NonNullable<typeof latest.data>) => {
      await queryClient.cancelQueries({ queryKey: trpc.brief.latest.queryKey() });
      queryClient.setQueryData(trpc.brief.latest.queryKey(), data);
    },
  };
  const {
    mutate: ensure,
    isPending: preparing,
    isError: prepareFailed,
    reset: resetPreparation,
  } = useMutation(trpc.brief.ensureToday.mutationOptions(options));
  const refresh = useMutation(
    trpc.brief.refresh.mutationOptions({
      onSuccess: async (data) => {
        await options.onSuccess(data);
        resetPreparation();
      },
    }),
  );
  useEffect(() => {
    ensure();
  }, [ensure]);
  const pending = preparing || refresh.isPending || latest.isPending;
  const data = latest.data;
  const failed = prepareFailed || refresh.isError || latest.isError;

  return (
    <Panel
      title={m.brief_title()}
      className="h-full min-h-0"
      action={
        <button
          type="button"
          disabled={pending || lost}
          onClick={() => refresh.mutate()}
          className="rounded-sm text-caption text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-accent disabled:opacity-50"
        >
          {m.brief_refresh()}
        </button>
      }
    >
      {pending ? (
        <LoadingSkeleton label={m.brief_loading()} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-md overflow-y-auto overscroll-contain">
          {!failed && data?.status === 'ready' ? (
            <ul aria-label={m.brief_title()} className="flex list-disc flex-col gap-xs pl-md text-body">
              {data.bullets.map((bullet, index) => (
                <li key={index} className="break-words">
                  {bullet}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col gap-xs text-body">
              <p>{m.brief_unavailable()}</p>
              {data && (
                <p className="text-muted-foreground">
                  {m.brief_counts({ events: data.counts.calendar, notes: data.counts.notes })}
                </p>
              )}
            </div>
          )}
          {!failed && data?.generatedAt !== undefined && data.generatedAt !== null && (
            <p className="mt-auto text-caption text-muted-foreground">
              {m.brief_updated()}{' '}
              <time dateTime={new Date(data.generatedAt).toISOString()}>{time.format(data.generatedAt)}</time>
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
