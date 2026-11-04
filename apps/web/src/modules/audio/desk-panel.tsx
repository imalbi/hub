import { Link } from '@tanstack/react-router';
import { useSubscription } from '@trpc/tanstack-react-query';
import { Panel } from '../../components/panel.tsx';
import { m } from '../../paraglide/messages.js';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import { OutputSwitch } from './output-switch.tsx';
export function AudioPanel({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const trpc = useTRPC();
  const audio = useSubscription(trpc.audio.onState.subscriptionOptions());
  const stale = useConnectionLost();
  return (
    <Panel
      title={m.tile_audio_output()}
      className={`${className} ${stale ? 'opacity-60' : ''}`}
      action={
        compact ? (
          <Link to="/desk/media" className="text-caption text-muted-foreground hover:text-foreground">
            {m.zone_open({ zone: m.zone_media() })}
          </Link>
        ) : undefined
      }
    >
      <p className="text-title">
        {audio.data
          ? (audio.data.current?.label ?? m.audio_output_none())
          : stale
            ? m.tile_unavailable()
            : m.tile_loading()}
      </p>
      {!compact && <OutputSwitch className="mt-auto" />}
    </Panel>
  );
}
