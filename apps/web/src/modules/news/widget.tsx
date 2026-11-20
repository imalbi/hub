import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { Panel } from '../../components/panel.tsx';
import { Readout } from '../../components/readout.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { LoadingSkeleton } from '../../components/ui/loading-skeleton.tsx';
import { NumberRoll } from '../../components/ui/number-roll.tsx';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';

// Always with the day: comparing with today would read the clock during render.
const when = new Intl.DateTimeFormat('it', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Web dev digest on Panoramica: Piccolo shows count + Aggiorna; Medio shows count/actions in header + 3 headlines. */
export function NewsWidget({ size }: { size: WidgetSize }) {
  const trpc = useTRPC();
  const news = useSubscription(trpc.news.onState.subscriptionOptions());
  const refresh = useMutation(trpc.news.refresh.mutationOptions());
  const open = useMutation(trpc.news.open.mutationOptions());
  const stale = useConnectionLost();
  const state = news.data;
  const updatedText = state
    ? state.refreshedAt === null
      ? m.news_fresh()
      : m.news_updated({ when: when.format(state.refreshedAt) })
    : undefined;

  if (size === 'small') {
    const headerState =
      state === undefined ? undefined : (
        <span className="text-muted-foreground">{state === null ? m.news_off() : updatedText}</span>
      );
    return (
      <Panel title={m.news_title()} className={`h-full ${stale ? 'opacity-60' : ''}`} action={headerState}>
        <div className="mt-auto flex items-end justify-between gap-sm">
          <div className="flex min-w-0 flex-col gap-3xs">
            {state === undefined ? (
              <LoadingSkeleton label={m.tile_loading()} rows={2} className="w-xl" />
            ) : state === null ? (
              <p className="text-body text-muted-foreground">{m.news_off()}</p>
            ) : (
              <>
                <p>
                  <Readout>
                    <NumberRoll value={state.items} />
                  </Readout>
                </p>
                <p className="truncate text-caption text-muted-foreground">
                  {state.fresh ? m.news_fresh() : m.news_last_page()}
                </p>
              </>
            )}
          </div>
          {state && <RegistryButton secondary label={m.news_refresh()} action={() => refresh.mutateAsync()} />}
        </div>
      </Panel>
    );
  }

  const headerAction = state ? (
    <div className="flex min-w-0 items-center gap-xs tracking-normal normal-case">
      <span className="min-w-0 truncate text-label text-muted-foreground tabular-nums">
        <span>{state.items}</span> {state.fresh ? m.news_fresh() : m.news_last_page()} · <span>{updatedText}</span>
      </span>
      <RegistryButton secondary label={m.news_refresh()} action={() => refresh.mutateAsync()} />
      <RegistryButton label={m.news_open()} action={() => open.mutateAsync()} />
    </div>
  ) : state === null ? (
    <span className="text-muted-foreground">{m.news_off()}</span>
  ) : undefined;

  return (
    <Panel title={m.news_title()} className={`h-full ${stale ? 'opacity-60' : ''}`} action={headerAction}>
      {state === undefined ? (
        <LoadingSkeleton label={m.tile_loading()} rows={3} />
      ) : state === null ? (
        <p className="mt-auto text-body text-muted-foreground">{m.news_off()}</p>
      ) : state.headlines.length > 0 ? (
        <ul className="mt-auto flex min-w-0 flex-col">
          {state.headlines.slice(0, 3).map((item, index) => (
            <li
              key={`${item.title}-${index}`}
              className="flex min-w-0 items-baseline justify-between gap-md border-b border-dashed border-border py-2xs last:border-b-0"
            >
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-body hover:underline"
                >
                  {item.title}
                </a>
              ) : (
                <span className="min-w-0 flex-1 truncate text-body">{item.title}</span>
              )}
              {item.source && <span className="shrink-0 text-caption text-muted-foreground">{item.source}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-auto text-body text-muted-foreground">{state.fresh ? m.news_fresh() : m.news_last_page()}</p>
      )}
    </Panel>
  );
}
