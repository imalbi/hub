import { EmptyState } from '../../components/ui/empty-state.tsx';
import { AnimatedRows } from '../../components/animated-list.tsx';
import { useMutation, useQuery } from '@tanstack/react-query';
import { m } from '../../paraglide/messages.js';
import { useTRPC } from '../../lib/trpc.ts';
import { CoverTile, pillOutline, type SongItem } from './parts.tsx';
import { SongRow } from './songs.tsx';

/** Ascolta (AltC): the last songs played as tiles, then the radio queue with its skip and stop buttons. */
export function Listen({
  queue,
  onPlay,
  onArtist,
}: {
  queue: { current: SongItem | null; seed: { title: string } | null; upcoming: SongItem[]; errors: number } | undefined;
  onPlay: (id: string) => void;
  onArtist: (id: string) => void;
}) {
  const trpc = useTRPC();
  const recent = useQuery(trpc.music.recent.queryOptions()).data ?? [];
  const skip = useMutation(trpc.music.skip.mutationOptions());
  const stop = useMutation(trpc.music.stop.mutationOptions());
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
                  <CoverTile src={song.cover} className="aspect-square w-full rounded-lg" />
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
          {queue?.current && queue.seed && (
            <p className="truncate text-label text-muted-foreground">
              {m.music_radio_from({ title: queue.seed.title })}
            </p>
          )}
          {queue?.current && (
            <>
              <button type="button" className={pillOutline} onClick={() => skip.mutate()} disabled={skip.isPending}>
                {m.music_skip()}
              </button>
              <button type="button" className={pillOutline} onClick={() => stop.mutate()} disabled={stop.isPending}>
                {m.music_stop()}
              </button>
            </>
          )}
        </div>
        {!queue?.current && <EmptyState title={m.music_queue_empty()} />}
        {queue?.errors === 3 && <output>{m.music_radio_error()}</output>}
        {(skip.isError || stop.isError) && <output>{m.music_player_error()}</output>}
        <ul className="grid min-h-0 flex-1 grid-cols-2 content-start gap-x-xl overflow-y-auto overscroll-contain">
          <AnimatedRows>
            {queue?.upcoming.map((song) => (
              <SongRow key={song.id} song={song} onPlay={onPlay} onArtist={onArtist} />
            ))}
          </AnimatedRows>
        </ul>
      </section>
    </div>
  );
}
