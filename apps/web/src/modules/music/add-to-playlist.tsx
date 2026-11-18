import { EmptyState } from '../../components/ui/empty-state.tsx';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from '@phosphor-icons/react';
import { Popover } from '@/components/ui/popover.tsx';
import { Input } from '@/components/ui/input.tsx';
import { useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';
import { iconButton, PlaylistCover, pillPrimary } from './parts.tsx';

type Track = { id: string; title: string; artists: { name: string }[] };

/** One field and a button that create a playlist, in the library column and at the foot of the add popover. */
export function NewPlaylist({ onCreated }: { onCreated?: (id: number) => void }) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const [name, setName] = React.useState('');
  const create = useMutation(
    trpc.music.createPlaylist.mutationOptions({
      onSuccess: (list) => {
        setName('');
        void client.invalidateQueries({ queryKey: trpc.music.playlists.queryKey() });
        onCreated?.(list.id);
      },
    }),
  );
  return (
    <form
      className="flex gap-xs"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) create.mutate({ name });
      }}
    >
      <Input
        aria-label={m.music_playlist_name()}
        placeholder={m.music_playlist_new()}
        value={name}
        onValueChange={setName}
        className="min-w-0 flex-1"
      />
      <button className={pillPrimary} disabled={!name.trim() || create.isPending}>
        {m.music_playlist_make()}
      </button>
    </form>
  );
}

export function AddToPlaylist({ song }: { song: Track }) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const lists = useQuery(trpc.music.playlists.queryOptions());
  const add = useMutation(
    trpc.music.addToPlaylist.mutationOptions({
      // `playlists` too: its rows show the count and the first covers.
      onSuccess: () =>
        Promise.all([
          client.invalidateQueries({ queryKey: trpc.music.playlist.queryKey() }),
          client.invalidateQueries({ queryKey: trpc.music.playlists.queryKey() }),
        ]),
    }),
  );
  const addTo = (playlistId: number) =>
    add.mutate({
      playlistId,
      id: song.id,
      title: song.title,
      artist: song.artists.map((artist) => artist.name).join(', '),
    });
  return (
    <Popover
      label={m.music_playlist_add_label()}
      align="end"
      trigger={
        <button type="button" className={iconButton} aria-label={m.music_playlist_add({ title: song.title })}>
          <PlusIcon aria-hidden="true" />
        </button>
      }
    >
      {({ close }) => (
        <div className="flex flex-col gap-2xs">
          <p className="px-sm py-xs text-label text-muted-foreground">{m.music_playlist_add({ title: song.title })}</p>
          {lists.data?.length === 0 && <EmptyState title={m.music_playlist_empty()} />}
          {lists.data?.map((list) => (
            <button
              type="button"
              key={list.id}
              className="flex h-touch items-center gap-sm rounded-lg px-sm text-left text-body hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => {
                addTo(list.id);
                close();
              }}
            >
              <PlaylistCover className="size-xl rounded-sm" />
              {list.name}
            </button>
          ))}
          <div className="mt-xs border-t border-dashed border-border pt-sm">
            <NewPlaylist
              onCreated={(id) => {
                addTo(id);
                close();
              }}
            />
          </div>
        </div>
      )}
    </Popover>
  );
}
