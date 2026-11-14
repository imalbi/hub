import { useMutation, useQuery } from '@tanstack/react-query';
import { m } from '../../paraglide/messages.js';
import { useTRPC } from '../../lib/trpc.ts';
import { CoverTile, pillOutline, type SongItem } from './parts.tsx';
import { SongRow } from './songs.tsx';

/** Ascolta (AltC): the last songs played as tiles, then the radio queue with its skip button. */
export function Listen({
  queue,
  onPlay,
  onArtist,
}: {
  queue: { current: SongItem | null; upcoming: SongItem[]; errors: number } | undefined;
  onPlay: (id: string) => void;
  onArtist: (id: string) => void;
}) {
  const trpc = useTRPC();
  const history = useQuery(trpc.music.history.queryOptions());
  const skip = useMutation(trpc.music.skip.mutationOptions());
  // The history keeps one row per listen: a song heard twice is one tile.
  const recent = [...new Map((history.data ?? []).map((row) => [row.id, row])).values()].slice(0, 5);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-lg">
      {recent.length > 0 && (
        <section aria-labelledby="music-recent" className="flex flex-col gap-md">
          <h2 id="music-recent" className="text-heading">
            {m.music_recent()}
          </h2>
          <ul className="grid grid-cols-5 gap-md">
            {recent.map((song) => (
              <li key={song.id} className="min-w-0">
                <button
                  type="button"
                  aria-label={m.music_play({ title: song.title })}
                  className="flex w-full flex-col gap-xs text-left focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => onPlay(song.id)}
                >
                  <CoverTile className="aspect-square w-full rounded-lg" />
                  <span className="truncate text-label">{song.title}</span>
                  <span className="-mt-xs truncate text-caption text-muted-foreground">{song.artist}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label={m.music_next()} className="flex min-h-0 flex-1 flex-col gap-sm">
        <div className="flex items-center gap-md">
          <h2 className="flex-1 text-heading">{m.music_next()}</h2>
          {queue?.current && (
            <button type="button" className={pillOutline} onClick={() => skip.mutate()} disabled={skip.isPending}>
              {m.music_skip()}
            </button>
          )}
        </div>
        {!queue?.current && <output>{m.music_queue_empty()}</output>}
        {queue?.errors === 3 && <output>{m.music_radio_error()}</output>}
        {skip.isError && <output>{m.music_player_error()}</output>}
        <ul className="grid min-h-0 flex-1 grid-cols-2 content-start gap-x-xl overflow-y-auto overscroll-contain">
          {queue?.upcoming.map((song) => (
            <SongRow key={song.id} song={song} onPlay={onPlay} onArtist={onArtist} />
          ))}
        </ul>
      </section>
    </div>
  );
}
