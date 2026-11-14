import { MusicNoteIcon, PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from '@phosphor-icons/react';
import { IconMorph } from '../../components/ui/icon-morph.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { m } from '../../paraglide/messages.js';
import { useMedia } from './media-provider.tsx';

export function PlaybackIcon() {
  const media = useMedia();
  return (
    <IconMorph
      from={<PlayIcon className="size-icon" aria-hidden />}
      to={<PauseIcon className="size-icon" aria-hidden />}
      active={media.playing}
      style={{ width: 'var(--spacing-icon)', height: 'var(--spacing-icon)' }}
    />
  );
}
/**
 * `large`: the cover of a panel (a fixed 6rem square); with `fill` as tall as the parent allows (a widget cell). Small is a
 * thumbnail; `named` gives it the "Copertina di" name, `className` its own size and shape (the player bar's round one).
 */
export function Cover({
  large = false,
  fill = false,
  named = false,
  className,
}: {
  large?: boolean;
  fill?: boolean;
  named?: boolean;
  className?: string;
}) {
  const media = useMedia();
  // The widgets' small and large covers keep their exact old shapes: the thumbnail is rounder as a placeholder than as art.
  const box =
    className ??
    (large ? (fill ? 'aspect-square h-full max-w-full rounded-xl' : 'size-4xl rounded-lg') : 'size-3xl rounded-xl');
  const art = className ?? (large ? box : 'size-3xl rounded-md');
  return media.art ? (
    <img
      src={media.art.dataUrl}
      alt={large || named ? m.media_cover({ title: media.state?.title ?? '' }) : ''}
      className={`${large && fill ? '' : 'shrink-0'} object-cover ${art}`}
    />
  ) : (
    <div aria-hidden className={`flex shrink-0 items-center justify-center border border-border bg-muted ${box}`}>
      <MusicNoteIcon className="size-icon-lg text-muted-foreground" />
    </div>
  );
}
/** `compact`: ghost previous and next around the play button (the Musica player, AltC). */
export function Transport({ compact = false }: { compact?: boolean }) {
  const media = useMedia();
  return (
    <div className="flex items-center gap-xs">
      <RegistryButton
        iconOnly
        secondary
        ghost={compact}
        label={m.media_previous()}
        action={() => media.previous.mutateAsync()}
        disabled={media.disabled}
        icon={<SkipBackIcon className="size-icon" aria-hidden />}
      />
      <RegistryButton
        iconOnly
        className={compact ? 'size-ball' : ''}
        label={media.playing ? m.media_action_pause() : m.media_action_play()}
        action={() => media.playPause.mutateAsync()}
        disabled={media.disabled}
        icon={<PlaybackIcon />}
      />
      <RegistryButton
        iconOnly
        secondary
        ghost={compact}
        label={m.media_next()}
        action={() => media.next.mutateAsync()}
        disabled={media.disabled}
        icon={<SkipForwardIcon className="size-icon" aria-hidden />}
      />
    </div>
  );
}
