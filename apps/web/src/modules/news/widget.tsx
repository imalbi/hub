import { Readout } from '../../components/readout.tsx';
import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { Panel } from '../../components/panel.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';

// Always with the day: comparing with today would read the clock during render.
const when = new Intl.DateTimeFormat('it', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The owner's web dev digest: how many items the last page holds, when it ran, refresh and open on the PC. */
export function NewsWidget({ size }: { size: WidgetSize }) {
  const trpc = useTRPC();
  const news = useSubscription(trpc.news.onState.subscriptionOptions());
  const refresh = useMutation(trpc.news.refresh.mutationOptions());
  const open = useMutation(trpc.news.open.mutationOptions());
  const stale = useConnectionLost();
  const state = news.data;
  return (
    <Panel title={m.news_title()} className={`h-full ${stale ? 'opacity-60' : ''}`}>
      <div className="mt-auto flex items-end justify-between gap-md">
        <div className="flex min-w-0 flex-col gap-2xs">
          <p className="text-caption text-muted-foreground">
            {state === undefined
              ? m.tile_loading()
              : state === null
                ? m.news_off()
                : state.refreshedAt === null
                  ? m.news_fresh()
                  : m.news_updated({ when: when.format(state.refreshedAt) })}
          </p>
          {state && (
            <p className="flex items-baseline gap-xs">
              <Readout>{state.items}</Readout>
              <span className="text-caption text-muted-foreground">
                {state.fresh ? m.news_fresh() : m.news_last_page()}
              </span>
            </p>
          )}
        </div>
        {state && size !== 'small' && (
          <div className="flex shrink-0 gap-xs">
            <RegistryButton secondary label={m.news_refresh()} action={() => refresh.mutateAsync()} />
            <RegistryButton label={m.news_open()} action={() => open.mutateAsync()} />
          </div>
        )}
      </div>
    </Panel>
  );
}
