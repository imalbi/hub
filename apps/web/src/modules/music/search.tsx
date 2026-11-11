import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { PlayIcon, MusicNoteIcon } from '@phosphor-icons/react';
import { SearchInput } from '@/components/ui/search-input.tsx';
import { useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';

export function MusicSearch() {
  const trpc = useTRPC();
  const [query, setQuery] = React.useState('');
  const results = useQuery({
    ...trpc.music.search.queryOptions({ query }),
    enabled: query.trim().length > 0,
    retry: false,
  });
  const play = useMutation(trpc.music.play.mutationOptions());
  const skip = useMutation(trpc.music.skip.mutationOptions());
  const queue = useSubscription(trpc.music.onQueue.subscriptionOptions()).data;
  return (
    <div className="flex h-full min-h-0 flex-col gap-md">
      <SearchInput
        aria-label={m.music_search()}
        placeholder={m.music_search()}
        clearLabel={m.music_clear()}
        shortcut={null}
        onSearch={setQuery}
        loading={results.isFetching}
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-xl">
        {queue?.current && (
          <section aria-label={m.music_next()} className="mb-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-body">{m.music_next()}</h3>
              <button
                type="button"
                className="min-h-touch rounded-full px-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => skip.mutate()}
                disabled={skip.isPending}
              >
                {m.music_skip()}
              </button>
            </div>
            <ul>
              {queue.upcoming.map((song) => (
                <li key={song.id} className="flex items-center gap-md border-b border-border py-sm">
                  <div className="flex size-touch shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                    {song.cover ? (
                      <img src={song.cover} alt="" className="size-full object-cover" />
                    ) : (
                      <MusicNoteIcon aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body">{song.title}</p>
                    <p className="truncate text-caption text-muted-foreground">
                      {song.artists.map((artist) => artist.name).join(', ')}
                    </p>
                  </div>
                  <Duration seconds={song.seconds} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {queue?.errors === 3 && <output>{m.music_radio_error()}</output>}
        {skip.isError && <output>{m.music_player_error()}</output>}
        {results.isError && <output>{m.music_search_error()}</output>}
        {play.isError && <output>{m.music_player_error()}</output>}
        {query && results.isSuccess && results.data.length === 0 && <output>{m.music_empty()}</output>}
        <ul>
          {results.data?.map((song) => (
            <li key={song.id} className="flex items-center gap-md border-b border-border py-sm">
              <div className="flex size-touch shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                {song.cover ? (
                  <img src={song.cover} alt="" className="size-full object-cover" />
                ) : (
                  <MusicNoteIcon aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body">{song.title}</p>
                <p className="truncate text-caption text-muted-foreground">
                  {song.artists.map((artist) => artist.name).join(', ')}
                </p>
              </div>
              <Duration seconds={song.seconds} />
              <button
                type="button"
                aria-label={m.music_play({ title: song.title })}
                className="flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => play.mutate({ id: song.id })}
              >
                <PlayIcon aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Duration({ seconds }: { seconds?: number }) {
  if (seconds === undefined) return null;
  return (
    <span className="text-caption text-muted-foreground tabular-nums">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  );
}
