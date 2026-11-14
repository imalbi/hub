import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@hub/server';
import { AudioButton } from '../media/audio-button.tsx';
import { useMedia } from '../media/media-provider.tsx';
import { PlayerBar } from '../media/player-bar.tsx';
import { AddToPlaylist } from './add-to-playlist.tsx';
import { Favorite } from './favorite.tsx';
import { Artists } from './parts.tsx';
import { useMusicVolume } from './volume.ts';

type Queue = inferRouterOutputs<AppRouter>['music']['queue'];

/** The player bar with the Musica extras: the current song's artist links, favourite, add to playlist and the volume. */
export function MusicPlayer({ queue, onArtist }: { queue: Queue | undefined; onArtist: (id: string) => void }) {
  const media = useMedia();
  const volume = useMusicVolume();
  const current = queue?.current;
  // The queue is Hub's radio; the player may be showing another app's track, whose artist is plain text.
  const linked = current && current.title === media.state?.title;
  return (
    <PlayerBar
      className="absolute -bottom-touch left-1/2 z-10 w-5/6 -translate-x-1/2"
      artist={linked ? <Artists artists={current.artists} onOpen={onArtist} /> : undefined}
      actions={
        <>
          {current && <Favorite song={current} />}
          {current && <AddToPlaylist song={current} />}
          <AudioButton music={{ volume: volume.volume, onVolume: volume.set }} />
        </>
      }
    />
  );
}
