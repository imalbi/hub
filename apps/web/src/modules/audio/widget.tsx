import { Link } from '@tanstack/react-router';
import { useSubscription } from '@trpc/tanstack-react-query';
import { Panel } from '../../components/panel.tsx';
import { LoadingSkeleton } from '../../components/ui/loading-skeleton.tsx';
import { NumberRoll } from '../../components/ui/number-roll.tsx';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';
import { AudioPanel } from './desk-panel.tsx';
import { OutputSwitch } from './output-switch.tsx';

/** Small puts volume in the header and output + switch on the bottom row; medium and wide use AudioPanel. */
export function AudioWidget({ size }: { size: WidgetSize }) {
  if (size === 'small') return <SmallAudio />;
  return <AudioPanel compact={size === 'wide'} className="h-full" />;
}

function SmallAudio() {
  const trpc = useTRPC();
  const audio = useSubscription(trpc.audio.onState.subscriptionOptions());
  const stale = useConnectionLost();
  return (
    <Panel
      title={m.tile_audio_output()}
      className={`relative h-full ${stale ? 'opacity-60' : ''}`}
      action={
        audio.data ? (
          <span data-readout="" className="text-figure text-muted-foreground">
            <NumberRoll value={Math.round(audio.data.volume * 100)} suffix="%" />
          </span>
        ) : undefined
      }
    >
      <Link
        to="/desk/system"
        aria-label={m.zone_open({ zone: m.zone_system() })}
        className="absolute inset-0 rounded-lg focus-visible:outline focus-visible:outline-accent"
      />
      <div className="mt-auto flex flex-wrap items-end justify-between gap-xs">
        {!audio.data && !stale ? (
          <LoadingSkeleton label={m.tile_loading()} rows={1} className="w-2xl" />
        ) : (
          <p className="min-w-0 flex-1 truncate text-heading">
            {audio.data ? (audio.data.current?.label ?? m.audio_output_none()) : m.tile_unavailable()}
          </p>
        )}
        <div className="relative z-10 shrink-0">
          <OutputSwitch />
        </div>
      </div>
    </Panel>
  );
}
