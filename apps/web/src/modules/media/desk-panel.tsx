import { LoadingSkeleton } from '../../components/ui/loading-skeleton.tsx';
import { TextMorph } from '../../components/ui/text-morph.tsx';
import { Link } from '@tanstack/react-router';
import { Panel } from '../../components/panel.tsx';
import { m } from '../../paraglide/messages.js';
import { Cover, PlaybackIcon } from './controls.tsx';
import { useMedia } from './media-provider.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';

export function MediaPanel({ className = '' }: { className?: string }) {
  const media = useMedia();
  const status = media.state
    ? { Playing: m.media_playing, Paused: m.media_paused, Stopped: m.media_stopped }[media.state.status]()
    : null;
  const title =
    media.state === undefined
      ? media.connectionLost
        ? m.tile_unavailable()
        : m.tile_loading()
      : media.state?.title || m.media_nothing_playing();
  return (
    <Panel
      title={m.tile_media()}
      className={`relative ${media.connectionLost ? 'opacity-60' : ''} ${className}`}
      action={
        <Link to="/desk/media" className="text-caption text-muted-foreground hover:text-foreground">
          {m.zone_open({ zone: m.zone_media() })}
        </Link>
      }
    >
      <div className="flex min-w-0 items-center gap-md">
        <Cover large />
        <div className="flex min-w-0 flex-1 flex-col gap-sm">
          {media.state === undefined && !media.connectionLost ? (
            <LoadingSkeleton label={m.tile_loading()} rows={3} />
          ) : (
            <p className="text-title break-words">
              <TextMorph animateWidth={false}>{title}</TextMorph>
            </p>
          )}
          {media.state?.artist && (
            <p className="text-body text-muted-foreground">
              <TextMorph animateWidth={false}>{media.state.artist}</TextMorph>
            </p>
          )}
          {status && (
            <p className="text-caption text-muted-foreground">
              <TextMorph animateWidth={false}>{status}</TextMorph>
            </p>
          )}
        </div>
        <RegistryButton
          iconOnly
          label={media.playing ? m.media_action_pause() : m.media_action_play()}
          action={() => media.playPause.mutateAsync()}
          disabled={media.disabled}
          icon={<PlaybackIcon />}
        />
      </div>
    </Panel>
  );
}
