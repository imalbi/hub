import { useSubscription } from '@trpc/tanstack-react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Panel } from '../../components/panel.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { FadingLine } from '../../components/ui/fading-line.tsx';
import { LoadingSkeleton } from '../../components/ui/loading-skeleton.tsx';
import { Slider } from '../../components/ui/slider.tsx';
import { useIsOn } from '../../lib/enabled-modules.ts';
import { useTRPC } from '../../lib/trpc.ts';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';
import { Cover, PlaybackIcon, Transport } from './controls.tsx';
import { useMedia } from './media-provider.tsx';
import { time } from './player-bar.tsx';

/** Musica on Panoramica: P3 cover+artist+play (Piccolo), P4 tall cover+seek+transport (Medio/Largo), P5 cover+seek+Prossimi 3 (Grande). */
export function MediaWidget({ size }: { size: WidgetSize }) {
  if (size === 'small') return <SmallMedia />;
  if (size === 'large') return <LargeMedia />;
  return <MediumMedia />;
}

function useTrackTitle() {
  const media = useMedia();
  if (media.state === undefined) return media.connectionLost ? m.tile_unavailable() : m.tile_loading();
  return media.state?.title || m.media_nothing_playing();
}

function usePlaybackStatus() {
  const media = useMedia();
  if (!media.state) return null;
  return { Playing: m.media_playing, Paused: m.media_paused, Stopped: m.media_stopped }[media.state.status]();
}

function MediaOutputLink() {
  const isOn = useIsOn();
  const audioOn = isOn('audio');
  return (
    <Link
      to="/desk/media"
      aria-label={m.zone_open({ zone: m.zone_media() })}
      className="text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-accent"
    >
      {audioOn ? <AudioOutputName /> : m.zone_open({ zone: m.zone_media() })}
    </Link>
  );
}

function AudioOutputName() {
  const trpc = useTRPC();
  const audio = useSubscription(trpc.audio.onState.subscriptionOptions());
  return <>{audio.data?.current?.label || m.zone_open({ zone: m.zone_media() })}</>;
}

/** Piccolo (P3): status in header, cover + title + artist + single play/pause bottom row, stretched page link. */
function SmallMedia() {
  const media = useMedia();
  const title = useTrackTitle();
  const status = usePlaybackStatus();
  const pending = media.state === undefined && !media.connectionLost;
  return (
    <Panel
      title={m.tile_media()}
      className={`relative h-full ${media.connectionLost ? 'opacity-60' : ''}`}
      action={status ? <span className="text-muted-foreground">{status}</span> : undefined}
    >
      <Link
        to="/desk/media"
        aria-label={m.zone_open({ zone: m.zone_media() })}
        className="absolute inset-0 rounded-lg focus-visible:outline focus-visible:outline-accent"
      />
      <div className="mt-auto flex min-w-0 items-center justify-between gap-sm">
        <div className="flex min-w-0 flex-1 items-center gap-sm">
          <Cover />
          <div className="flex min-w-0 flex-1 flex-col gap-3xs">
            {pending ? (
              <LoadingSkeleton label={m.tile_loading()} rows={2} />
            ) : (
              <>
                <p className="truncate text-body">
                  <FadingLine subject={title}>{title}</FadingLine>
                </p>
                {media.state?.artist && (
                  <p className="truncate text-caption text-muted-foreground">
                    <FadingLine subject={media.state.artist}>{media.state.artist}</FadingLine>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        <div className="relative z-10 shrink-0">
          <RegistryButton
            iconOnly
            label={media.playing ? m.media_action_pause() : m.media_action_play()}
            action={() => media.playPause.mutateAsync()}
            disabled={media.disabled}
            icon={<PlaybackIcon />}
          />
        </div>
      </div>
    </Panel>
  );
}

/** Medio (P4): tall square cover on the left, title + artist/status, seek bar + transport on the right. */
function MediumMedia() {
  const media = useMedia();
  const title = useTrackTitle();
  const status = usePlaybackStatus();
  const pending = media.state === undefined && !media.connectionLost;
  const subtitle = [media.state?.artist, status].filter(Boolean).join(' · ');
  return (
    <Panel
      title={m.tile_media()}
      className={`h-full ${media.connectionLost ? 'opacity-60' : ''}`}
      action={<MediaOutputLink />}
    >
      <div className="flex min-h-0 flex-1 items-stretch gap-lg">
        <div className="aspect-square h-full shrink-0">
          <Cover large fill named />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-xs">
          <div className="flex min-w-0 flex-col gap-3xs">
            {pending ? (
              <LoadingSkeleton label={m.tile_loading()} rows={2} />
            ) : (
              <>
                <p className="truncate text-heading">
                  <FadingLine subject={title}>{title}</FadingLine>
                </p>
                {subtitle && (
                  <p className="truncate text-label text-muted-foreground">
                    <FadingLine subject={subtitle}>{subtitle}</FadingLine>
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-md">
            <div className="min-w-0 flex-1">
              <MediaSeek />
            </div>
            <div className="shrink-0">
              <Transport compact />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** Grande (P5): large square cover left; title, artist, seek line with times, centered transport, and Prossimi 3 right. */
function LargeMedia() {
  const isOn = useIsOn();
  const musicOn = isOn('music');
  const media = useMedia();
  const title = useTrackTitle();
  const pending = media.state === undefined && !media.connectionLost;
  return (
    <Panel
      title={m.tile_media()}
      className={`h-full ${media.connectionLost ? 'opacity-60' : ''}`}
      action={<MediaOutputLink />}
    >
      <div className="flex min-h-0 flex-1 items-stretch gap-lg">
        <div className="flex w-1/3 shrink-0 items-center">
          <Cover large named className="aspect-square w-full rounded-lg" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-sm">
          <div className="flex min-w-0 flex-col gap-3xs">
            {pending ? (
              <LoadingSkeleton label={m.tile_loading()} rows={2} />
            ) : (
              <>
                <p className="truncate text-heading">
                  <FadingLine subject={title}>{title}</FadingLine>
                </p>
                {media.state?.artist && (
                  <p className="truncate text-label text-muted-foreground">
                    <FadingLine subject={media.state.artist}>{media.state.artist}</FadingLine>
                  </p>
                )}
              </>
            )}
          </div>
          <MediaSeek showTimes />
          <div className="flex justify-center">
            <Transport compact />
          </div>
          {musicOn && <UpcomingTracks />}
        </div>
      </div>
    </Panel>
  );
}

function MediaSeek({ showTimes = false }: { showTimes?: boolean }) {
  const media = useMedia();
  const lengthMs = media.state?.lengthMs;
  const positionMs = media.state?.positionMs;
  const length = lengthMs !== null && lengthMs !== undefined ? Math.floor(lengthMs / 1000) : null;
  const position = positionMs !== null && positionMs !== undefined ? Math.floor(positionMs / 1000) : null;
  if (length === null || length <= 0 || position === null) {
    return <div className="h-2xs w-full rounded-full bg-muted" />;
  }
  return <SeekSlider key={media.state?.title} position={position} length={length} showTimes={showTimes} />;
}

function SeekSlider({ position, length, showTimes }: { position: number; length: number; showTimes: boolean }) {
  const media = useMedia();
  const [draft, setDraft] = useState<number | null>(null);
  const value = Math.min(length, draft ?? position);
  return (
    <div className="flex min-w-0 flex-col gap-2xs">
      <Slider
        label={m.media_position()}
        min={0}
        max={length}
        value={value}
        format={time}
        thin
        disabled={media.disabled}
        onValueChange={([next]) => setDraft(next)}
        onValueCommit={([seconds]) => media.seek.mutate({ seconds }, { onSettled: () => setDraft(null) })}
      />
      {showTimes && (
        <div className="flex items-center justify-between gap-sm text-figure text-muted-foreground">
          <span>{time(value)}</span>
          <span>{time(length)}</span>
        </div>
      )}
    </div>
  );
}

function UpcomingTracks() {
  const trpc = useTRPC();
  const queue = useSubscription(trpc.music.onQueue.subscriptionOptions()).data;
  const upcoming = queue?.upcoming.slice(0, 3) ?? [];
  if (upcoming.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-3xs">
      <p className="text-caps text-muted-foreground">{m.media_upcoming()}</p>
      <ul className="flex min-w-0 flex-col gap-3xs">
        {upcoming.map((song, index) => {
          const artist = song.artists.map((item) => item.name).join(', ');
          return (
            <li key={`${song.id}-${index}`} className="truncate text-body">
              {song.title}
              {artist && <span className="text-muted-foreground"> · {artist}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
