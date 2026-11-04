import { Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { IconMorph } from '../../components/ui/icon-morph.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { m } from '../../paraglide/messages.js';
import { useMedia } from './media-provider.tsx';

export function PlaybackIcon() {
  const media = useMedia();
  return (
    <IconMorph
      from={<Play className="size-icon" aria-hidden />}
      to={<Pause className="size-icon" aria-hidden />}
      active={media.playing}
      style={{ width: 'var(--spacing-icon)', height: 'var(--spacing-icon)' }}
    />
  );
}
export function Cover({ large = false }: { large?: boolean }) {
  const media = useMedia();
  return media.art ? (
    <img
      src={media.art.dataUrl}
      alt={large ? m.media_cover({ title: media.state?.title ?? '' }) : ''}
      className={large ? 'media-cover rounded-xl object-cover' : 'size-3xl shrink-0 rounded-md object-cover'}
    />
  ) : (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-xl border border-border bg-muted ${large ? 'media-cover' : 'size-3xl'}`}
    >
      <Music2 className="size-icon-lg text-muted-foreground" />
    </div>
  );
}
export function Transport() {
  const media = useMedia();
  return (
    <div className="flex items-center gap-xs">
      <RegistryButton
        iconOnly
        secondary
        label={m.media_previous()}
        action={() => media.previous.mutateAsync()}
        disabled={media.disabled}
        icon={<SkipBack className="size-icon" aria-hidden />}
      />
      <RegistryButton
        iconOnly
        label={media.playing ? m.media_action_pause() : m.media_action_play()}
        action={() => media.playPause.mutateAsync()}
        disabled={media.disabled}
        icon={<PlaybackIcon />}
      />
      <RegistryButton
        iconOnly
        secondary
        label={m.media_next()}
        action={() => media.next.mutateAsync()}
        disabled={media.disabled}
        icon={<SkipForward className="size-icon" aria-hidden />}
      />
    </div>
  );
}
