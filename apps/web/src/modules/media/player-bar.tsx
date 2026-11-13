import { useState, type ReactNode } from 'react';
import { Slider } from '../../components/ui/slider.tsx';
import { m } from '../../paraglide/messages.js';
import { Cover, Transport } from './controls.tsx';
import { useMedia } from './media-provider.tsx';

function time(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function Position({ position, length }: { position: number; length: number }) {
  const media = useMedia();
  const [draft, setDraft] = useState<number | null>(null);
  const value = Math.min(length, draft ?? position);
  return (
    <div className="flex min-w-0 items-center gap-sm">
      <span className="text-caption text-muted-foreground tabular-nums">{time(value)}</span>
      <Slider
        label={m.media_position()}
        min={0}
        max={length}
        value={value}
        format={time}
        disabled={media.disabled}
        onValueChange={([next]) => setDraft(next)}
        onValueCommit={([seconds]) => media.seek.mutate({ seconds }, { onSettled: () => setDraft(null) })}
      />
      <span className="text-caption text-muted-foreground tabular-nums">{time(length)}</span>
    </div>
  );
}

/**
 * The player of the Media page, the last row of its surface: transport, cover, title and artist, the position, then
 * whatever the page adds on the right (favourite, add to playlist, the audio button). `artist` replaces the plain artist
 * text when the page can link it.
 */
export function PlayerBar({ artist, actions }: { artist?: ReactNode; actions?: ReactNode }) {
  const media = useMedia();
  const length = media.state?.lengthMs;
  const seconds = length === null || length === undefined ? null : Math.floor(length / 1000);
  const position = media.state?.positionMs;
  return (
    <section
      aria-label={m.media_player()}
      className="desk-glass flex shrink-0 items-center gap-lg rounded-full border px-lg py-xs"
    >
      <Transport />
      <Cover named className="size-2xl rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline gap-sm">
          <p className="truncate text-label">{media.state?.title || m.media_nothing_playing()}</p>
          <p className="truncate text-caption text-muted-foreground">{artist ?? media.state?.artist}</p>
        </div>
        {seconds !== null && seconds > 0 && position !== null && position !== undefined && (
          <Position key={media.state?.title} position={Math.floor(position / 1000)} length={seconds} />
        )}
      </div>
      {actions}
    </section>
  );
}
