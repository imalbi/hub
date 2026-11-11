import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from '@phosphor-icons/react';
import { Popover } from '@/components/ui/popover.tsx';
import { HoldButton } from '@/components/hold-button.tsx';
import { useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';

type Track = { id: string; title: string; artists: { name: string }[] };
const button = 'min-h-touch rounded-full px-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring';

export function AddToPlaylist({ song }: { song: Track }) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const lists = useQuery(trpc.music.playlists.queryOptions());
  const add = useMutation(
    trpc.music.addToPlaylist.mutationOptions({
      onSuccess: () => client.invalidateQueries({ queryKey: trpc.music.playlist.queryKey() }),
    }),
  );
  return (
    <Popover
      label={m.music_playlist_add_label()}
      trigger={
        <button type="button" className={button} aria-label={m.music_playlist_add({ title: song.title })}>
          <PlusIcon aria-hidden="true" />
        </button>
      }
    >
      {({ close }) => (
        <div>
          {lists.data?.length
            ? lists.data.map((list) => (
                <button
                  type="button"
                  className={`${button} block w-full text-left`}
                  key={list.id}
                  onClick={() => {
                    add.mutate({
                      playlistId: list.id,
                      id: song.id,
                      title: song.title,
                      artist: song.artists.map((artist) => artist.name).join(', '),
                    });
                    close();
                  }}
                >
                  {list.name}
                </button>
              ))
            : m.music_playlist_empty()}
        </div>
      )}
    </Popover>
  );
}

export function Playlists() {
  const trpc = useTRPC();
  const client = useQueryClient();
  const [name, setName] = React.useState('');
  const [selected, setSelected] = React.useState<number | null>(null);
  const lists = useQuery(trpc.music.playlists.queryOptions());
  const create = useMutation(
    trpc.music.createPlaylist.mutationOptions({
      onSuccess: () => {
        setName('');
        void client.invalidateQueries({ queryKey: trpc.music.playlists.queryKey() });
      },
    }),
  );
  if (selected !== null) return <LocalPlaylist id={selected} onBack={() => setSelected(null)} />;
  return (
    <section aria-label={m.music_playlists()}>
      <form
        className="flex gap-sm"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) create.mutate({ name });
        }}
      >
        <input
          aria-label={m.music_playlist_name()}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-touch min-w-0 flex-1 rounded-sm border border-border bg-background px-md"
        />
        <button className={button} disabled={!name.trim() || create.isPending}>
          {m.music_playlist_create()}
        </button>
      </form>
      {lists.data?.length === 0 && <p>{m.music_playlist_empty()}</p>}
      <ul>
        {lists.data?.map((list) => (
          <li key={list.id}>
            <button type="button" className={`${button} w-full text-left`} onClick={() => setSelected(list.id)}>
              {list.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LocalPlaylist({ id, onBack }: { id: number; onBack: () => void }) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const list = useQuery(trpc.music.playlist.queryOptions({ id }));
  const refresh = () => client.invalidateQueries({ queryKey: trpc.music.playlist.queryKey({ id }) });
  const move = useMutation(trpc.music.movePlaylistSong.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(trpc.music.removePlaylistSong.mutationOptions({ onSuccess: refresh }));
  const rename = useMutation(
    trpc.music.renamePlaylist.mutationOptions({
      onSuccess: () => {
        void refresh();
        void client.invalidateQueries({ queryKey: trpc.music.playlists.queryKey() });
      },
    }),
  );
  const del = useMutation(trpc.music.deletePlaylist.mutationOptions());
  const play = useMutation(trpc.music.playPlaylist.mutationOptions());
  const [name, setName] = React.useState('');
  return (
    <section aria-label={list.data?.name}>
      <button type="button" className={button} onClick={onBack}>
        {m.music_playlist_back()}
      </button>
      <h2 className="text-heading">{list.data?.name}</h2>
      <form
        className="flex gap-sm"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) rename.mutate({ id, name });
        }}
      >
        <input
          aria-label={m.music_playlist_name()}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-touch min-w-0 flex-1 rounded-sm border border-border bg-background px-md"
        />
        <button className={button} disabled={!name.trim()}>
          {m.music_playlist_rename()}
        </button>
      </form>
      <button type="button" className={button} disabled={!list.data?.songs.length} onClick={() => play.mutate({ id })}>
        {m.music_playlist_play()}
      </button>
      <HoldButton
        label={m.music_playlist_delete()}
        idle={m.music_playlist_delete_idle()}
        done={m.music_playlist_deleted()}
        outline
        onConfirm={async () => {
          await del.mutateAsync({ id, confirmed: true });
          await client.invalidateQueries({ queryKey: trpc.music.playlists.queryKey() });
          onBack();
        }}
      />
      {list.data?.songs.length === 0 && <p>{m.music_playlist_no_songs()}</p>}
      <ul>
        {list.data?.songs.map((song, index) => (
          <li key={index} className="flex items-center gap-sm border-b border-border py-sm">
            <div className="min-w-0 flex-1">
              <p>{song.title}</p>
              <p className="text-caption text-muted-foreground">{song.artist}</p>
            </div>
            <button
              type="button"
              className={button}
              aria-label={m.music_playlist_move_up({ title: song.title })}
              disabled={index === 0 || move.isPending}
              onClick={() => move.mutate({ playlistId: id, from: index, to: index - 1 })}
            >
              ↑
            </button>
            <button
              type="button"
              className={button}
              aria-label={m.music_playlist_move_down({ title: song.title })}
              disabled={index === list.data.songs.length - 1 || move.isPending}
              onClick={() => move.mutate({ playlistId: id, from: index, to: index + 1 })}
            >
              ↓
            </button>
            <button
              type="button"
              className={button}
              aria-label={m.music_playlist_remove({ title: song.title })}
              disabled={remove.isPending}
              onClick={() => remove.mutate({ playlistId: id, position: index })}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {(list.isError || play.isError || rename.isError || remove.isError || move.isError) && (
        <output>{m.music_playlist_error()}</output>
      )}
    </section>
  );
}

export function PublicPlaylists({ query }: { query: string }) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const [id, setId] = React.useState<string | null>(null);
  const results = useQuery({
    ...trpc.music.searchPlaylists.queryOptions({ query }),
    enabled: !!query.trim(),
    retry: false,
  });
  const list = useQuery({
    ...trpc.music.publicPlaylist.queryOptions({ id: id ?? '' }),
    enabled: id !== null,
    retry: false,
  });
  const play = useMutation(trpc.music.playPublicPlaylist.mutationOptions());
  const save = useMutation(
    trpc.music.savePublicPlaylist.mutationOptions({
      onSuccess: () => client.invalidateQueries({ queryKey: trpc.music.playlists.queryKey() }),
    }),
  );
  if (id === null)
    return (
      <ul>
        {results.data?.map((item) => (
          <li key={item.id}>
            <button type="button" className={button} onClick={() => setId(item.id)}>
              {item.title}
            </button>
          </li>
        ))}
      </ul>
    );
  return (
    <section aria-label={list.data?.title}>
      <button type="button" className={button} onClick={() => setId(null)}>
        {m.music_artist_back()}
      </button>
      <h2 className="text-heading">{list.data?.title}</h2>
      <button type="button" className={button} disabled={!list.data?.songs.length} onClick={() => play.mutate({ id })}>
        {m.music_playlist_play()}
      </button>
      <button
        type="button"
        className={button}
        disabled={!list.data || save.isPending}
        onClick={() => save.mutate({ id })}
      >
        {m.music_playlist_save()}
      </button>
      <ul>
        {list.data?.songs.map((song, index) => (
          <li key={`${song.id}-${index}`} className="flex items-center gap-sm border-b border-border py-sm">
            <span className="flex-1">{song.title}</span>
            <AddToPlaylist song={song} />
          </li>
        ))}
      </ul>
      {(list.isError || play.isError || save.isError) && <output>{m.music_playlist_error()}</output>}
    </section>
  );
}
