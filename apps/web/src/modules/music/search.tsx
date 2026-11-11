import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { PlayIcon, MusicNoteIcon } from '@phosphor-icons/react';
import { ButtonGroup } from '@/components/ui/button-group.tsx';
import { Favorite } from './favorite.tsx';
import { SearchInput } from '@/components/ui/search-input.tsx';
import { useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';

export function MusicSearch() {
  const trpc = useTRPC();
  const [query, setQuery] = React.useState('');
  const [view, setView] = React.useState<'results' | 'queue' | 'favorites' | 'history'>('results');
  const [artistId, setArtistId] = React.useState<string | null>(null);
  const artist = useQuery({
    ...trpc.music.artist.queryOptions({ id: artistId ?? '' }),
    enabled: artistId !== null,
    retry: false,
  });
  const favorites = useQuery(trpc.music.favorites.queryOptions());
  const history = useQuery(trpc.music.history.queryOptions());
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
      {!artistId && (
        <ButtonGroup
          label={m.music_views()}
          collapseLabels={false}
          items={[
            { id: 'results', label: m.music_results(), active: view === 'results', onClick: () => setView('results') },
            { id: 'queue', label: m.music_queue(), active: view === 'queue', onClick: () => setView('queue') },
            {
              id: 'favorites',
              label: m.music_favorites(),
              active: view === 'favorites',
              onClick: () => setView('favorites'),
            },
            {
              id: 'history',
              label: m.music_history(),
              active: view === 'history',
              onClick: () => {
                setView('history');
                void history.refetch();
              },
            },
          ]}
        />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-xl">
        {artistId && (
          <section aria-label={artist.data?.name}>
            <button
              type="button"
              onClick={() => setArtistId(null)}
              className="min-h-touch rounded-full px-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              {m.music_artist_back()}
            </button>
            {artist.isLoading && <output>{m.music_artist_loading()}</output>}
            {artist.isError && <output>{m.music_artist_error()}</output>}
            {play.isError && <output>{m.music_player_error()}</output>}
            {artist.data && (
              <>
                <div className="overflow-hidden rounded-lg bg-muted">
                  {artist.data.banner && <img src={artist.data.banner} alt="" className="h-4xl w-full object-cover" />}
                  <h2 className="p-lg text-heading">{artist.data.name}</h2>
                </div>
                <h3 className="mt-lg text-body">{m.music_artist_songs()}</h3>
                <ul>
                  {artist.data.songs.map((song) => (
                    <li key={song.id} className="flex items-center gap-md border-b border-border py-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body">{song.title}</p>
                        <p className="text-caption text-muted-foreground">
                          <Artists artists={song.artists} onOpen={setArtistId} />
                        </p>
                      </div>
                      <Duration seconds={song.seconds} />
                      <Favorite song={song} />
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
                <h3 className="mt-lg text-body">{m.music_artist_albums()}</h3>
                <ul className="mt-md flex flex-wrap gap-md">
                  {artist.data.albums.map((album, index) => (
                    <li key={`${album.title}-${index}`} className="w-label-col">
                      <div className="aspect-square overflow-hidden rounded-sm bg-muted">
                        {album.cover && <img src={album.cover} alt="" className="size-full object-cover" />}
                      </div>
                      <p className="mt-sm text-body">{album.title}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
        {!artistId && (
          <>
            {view === 'queue' && !queue?.current && <output>{m.music_queue_empty()}</output>}
            {view === 'queue' && queue?.current && (
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
                          <Artists artists={song.artists} onOpen={setArtistId} />
                        </p>
                      </div>
                      <Duration seconds={song.seconds} />
                      <Favorite song={song} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {queue?.errors === 3 && <output>{m.music_radio_error()}</output>}
            {skip.isError && <output>{m.music_player_error()}</output>}
            {view === 'results' && results.isError && <output>{m.music_search_error()}</output>}
            {play.isError && <output>{m.music_player_error()}</output>}
            {view === 'results' && query && results.isSuccess && results.data.length === 0 && (
              <output>{m.music_empty()}</output>
            )}
            {view === 'favorites' && favorites.isSuccess && favorites.data.length === 0 && (
              <output>{m.music_favorites_empty()}</output>
            )}
            {view === 'history' && history.isSuccess && history.data.length === 0 && (
              <output>{m.music_history_empty()}</output>
            )}
            <ul>
              {(view === 'queue'
                ? undefined
                : view === 'results'
                  ? results.data
                  : (view === 'favorites' ? favorites.data : history.data)?.map((song) => ({
                      ...song,
                      artists: song.artist ? [{ name: song.artist }] : [],
                      cover: null,
                      seconds: undefined,
                    }))
              )?.map((song, index) => (
                <li key={`${song.id}-${index}`} className="flex items-center gap-md border-b border-border py-sm">
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
                      <Artists artists={song.artists} onOpen={setArtistId} />
                    </p>
                  </div>
                  <Duration seconds={song.seconds} />
                  <Favorite song={song} />
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
          </>
        )}
      </div>
    </div>
  );
}

function Artists({ artists, onOpen }: { artists: { name: string; id?: string }[]; onOpen: (id: string) => void }) {
  return artists.map((artist, index) => {
    const id = artist.id;
    return (
      <React.Fragment key={`${artist.name}-${index}`}>
        {index > 0 && ', '}
        {id && /^UC[A-Za-z0-9_-]{22}$/.test(id) ? (
          <button
            type="button"
            className="hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => onOpen(id)}
          >
            {artist.name}
          </button>
        ) : (
          artist.name
        )}
      </React.Fragment>
    );
  });
}

function Duration({ seconds }: { seconds?: number }) {
  if (seconds === undefined) return null;
  return (
    <span className="text-caption text-muted-foreground tabular-nums">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  );
}
