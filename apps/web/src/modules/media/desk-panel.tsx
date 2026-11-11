import { Link } from '@tanstack/react-router';
import { Panel } from '../../components/panel.tsx';
import { m } from '../../paraglide/messages.js';
import { Cover, PlaybackIcon, Transport } from './controls.tsx';
import { useMedia } from './media-provider.tsx';
import { useIsOn } from '../../lib/enabled-modules.ts';
import { CurrentFavorite } from '../music/favorite.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { Slider } from '../../components/ui/slider.tsx';
import { useState } from 'react';

function time(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function Position({ position, length }: { position: number; length: number }) {
  const media = useMedia();
  const [draft, setDraft] = useState<number | null>(null);
  const value = Math.min(length, draft ?? position);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-sm">
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

function PlayerPill() {
  const media = useMedia();
  const isOn = useIsOn();
  const length = media.state?.lengthMs;
  const seconds = length === null || length === undefined ? null : Math.floor(length / 1000);
  const duration = seconds === null ? null : time(seconds);
  const position = media.state?.positionMs;
  return (
    <section
      aria-label={m.media_player()}
      className="desk-glass player-pill absolute right-lg bottom-0 left-lg flex min-w-0 translate-y-1/2 items-center gap-lg rounded-full border px-lg py-sm"
    >
      <Transport />
      <Cover />
      <div className="min-w-0 flex-1">
        <p className="truncate text-label">{media.state?.title || m.media_nothing_playing()}</p>
        <p className="truncate text-caption text-muted-foreground">{media.state?.artist}</p>
      </div>
      {isOn('music') && <CurrentFavorite />}
      {seconds !== null && seconds > 0 && position !== null && position !== undefined ? (
        <Position key={media.state?.title} position={Math.floor(position / 1000)} length={seconds} />
      ) : (
        duration && (
          <span className="text-caption text-muted-foreground tabular-nums" aria-label={m.media_duration({ duration })}>
            {duration}
          </span>
        )
      )}
    </section>
  );
}
export function MediaPanel({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
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
        compact ? (
          <Link to="/desk/media" className="text-caption text-muted-foreground hover:text-foreground">
            {m.zone_open({ zone: m.zone_media() })}
          </Link>
        ) : undefined
      }
    >
      <div className={`flex min-w-0 items-center ${compact ? 'gap-md' : 'media-hero gap-xl pb-2xl'}`}>
        <Cover large />
        <div className="flex min-w-0 flex-1 flex-col gap-sm">
          <p className={`${compact ? 'text-title' : 'text-hero'} break-words`}>{title}</p>
          {media.state?.artist && (
            <p className={`${compact ? 'text-body' : 'text-title'} text-muted-foreground`}>{media.state.artist}</p>
          )}
          {status && <p className="text-caption text-muted-foreground">{status}</p>}
        </div>
        {compact && (
          <RegistryButton
            iconOnly
            label={media.playing ? m.media_action_pause() : m.media_action_play()}
            action={() => media.playPause.mutateAsync()}
            disabled={media.disabled}
            icon={<PlaybackIcon />}
          />
        )}
      </div>
      {!compact && <PlayerPill />}
    </Panel>
  );
}
