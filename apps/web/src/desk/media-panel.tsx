import { Link } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { Pause, Play } from 'lucide-react';
import { Panel } from '../components/panel.tsx';
import { m } from '../paraglide/messages.js';
import { useConnectionLost, useTRPC } from '../trpc.ts';
export function MediaPanel({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const trpc = useTRPC();
  const media = useSubscription(trpc.media.onState.subscriptionOptions());
  const action = useMutation(trpc.media.playPause.mutationOptions());
  const stale = useConnectionLost();
  const playing = media.data?.status === 'Playing';
  const Icon = playing ? Pause : Play;
  const status = media.data
    ? { Playing: m.media_playing, Paused: m.media_paused, Stopped: m.media_stopped }[media.data.status]()
    : undefined;
  return (
    <Panel
      title={m.tile_media()}
      className={`${className} ${stale ? 'opacity-60' : ''}`}
      action={
        compact ? (
          <Link to="/desk/media" className="text-caption text-muted-foreground hover:text-foreground">
            {m.zone_open({ zone: m.zone_media() })}
          </Link>
        ) : undefined
      }
    >
      <div className="flex min-w-0 flex-col gap-xs">
        <p className={`${compact ? 'text-title' : 'text-display'} break-words`}>
          {media.data === undefined
            ? stale
              ? m.tile_unavailable()
              : m.tile_loading()
            : media.data?.title || m.media_nothing_playing()}
        </p>
        {media.data?.artist && <p className="text-body text-muted-foreground">{media.data.artist}</p>}
        {status && <p className="text-caption text-muted-foreground">{status}</p>}
      </div>
      <button
        type="button"
        disabled={!media.data || action.isPending || stale}
        aria-busy={action.isPending}
        onClick={() => action.mutate()}
        aria-label={playing ? m.media_action_pause() : m.media_action_play()}
        className="flex min-h-touch items-center gap-xs self-start rounded-full bg-primary px-md py-xs text-label text-primary-foreground hover:opacity-80 focus-visible:outline focus-visible:outline-accent disabled:opacity-60"
      >
        <Icon className="size-icon" aria-hidden />
        {playing ? m.media_action_pause() : m.media_action_play()}
      </button>
      {action.isError && (
        <p role="alert" className="text-caption text-danger">
          {m.tile_error()}
        </p>
      )}
    </Panel>
  );
}
