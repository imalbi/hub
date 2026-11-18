import { LoadingSkeleton } from '../../components/ui/loading-skeleton.tsx';
import { FadingLine } from '../../components/ui/fading-line.tsx';
import { Panel } from '../../components/panel.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';
import { Cover, PlaybackIcon, Transport } from './controls.tsx';
import { MediaPanel } from './desk-panel.tsx';
import { useMedia } from './media-provider.tsx';

export function MediaWidget({ size }: { size: WidgetSize }) {
  if (size === 'small') return <SmallMedia />;
  if (size === 'large') return <LargeMedia />;
  return <MediaPanel className="h-full" />;
}

function useTitle() {
  const media = useMedia();
  if (media.state === undefined) return media.connectionLost ? m.tile_unavailable() : m.tile_loading();
  return media.state?.title || m.media_nothing_playing();
}

/** The cover, the title and play/pause: the cover is the one spot of color. */
function SmallMedia() {
  const media = useMedia();
  const title = useTitle();
  return (
    <Panel title={m.tile_media()} className={`h-full ${media.connectionLost ? 'opacity-60' : ''}`}>
      <div className="mt-auto flex items-end justify-between gap-sm">
        <Cover />
        <RegistryButton
          iconOnly
          label={media.playing ? m.media_action_pause() : m.media_action_play()}
          action={() => media.playPause.mutateAsync()}
          disabled={media.disabled}
          icon={<PlaybackIcon />}
        />
      </div>
      <p className="text-label">
        {media.state === undefined && !media.connectionLost ? (
          <LoadingSkeleton label={m.tile_loading()} rows={1} />
        ) : (
          <FadingLine subject={title}>{title}</FadingLine>
        )}
      </p>
    </Panel>
  );
}

/** Large cover, title, artist and the full transport. */
function LargeMedia() {
  const media = useMedia();
  const title = useTitle();
  return (
    <Panel title={m.tile_media()} className={`h-full ${media.connectionLost ? 'opacity-60' : ''}`}>
      <div className="min-h-0 flex-1">
        <Cover large fill />
      </div>
      <div className="flex min-w-0 flex-col gap-2xs">
        <p className="text-title">
          {media.state === undefined && !media.connectionLost ? (
            <LoadingSkeleton label={m.tile_loading()} rows={1} />
          ) : (
            <FadingLine subject={title}>{title}</FadingLine>
          )}
        </p>
        {media.state?.artist && (
          <p className="text-body text-muted-foreground">
            <FadingLine subject={media.state.artist}>{media.state.artist}</FadingLine>
          </p>
        )}
      </div>
      <Transport />
    </Panel>
  );
}
