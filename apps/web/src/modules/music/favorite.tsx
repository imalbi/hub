import { HeartIcon } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';

type Track = { id: string; title: string; artists: { name: string }[] };

export function Favorite({ song }: { song: Track }) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const favorites = useQuery(trpc.music.favorites.queryOptions());
  const toggle = useMutation(
    trpc.music.toggleFavorite.mutationOptions({
      onSuccess: () => client.invalidateQueries({ queryKey: trpc.music.favorites.queryKey() }),
    }),
  );
  const selected = favorites.data?.some((item) => item.id === song.id) ?? false;
  return (
    <button
      type="button"
      aria-label={m.music_favorite({ title: song.title })}
      aria-pressed={selected}
      className="flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      disabled={toggle.isPending || !favorites.isSuccess}
      onClick={() =>
        toggle.mutate({ id: song.id, title: song.title, artist: song.artists.map((artist) => artist.name).join(', ') })
      }
    >
      <HeartIcon aria-hidden="true" weight={selected ? 'fill' : 'regular'} />
    </button>
  );
}

export function CurrentFavorite() {
  const trpc = useTRPC();
  const queue = useSubscription(trpc.music.onQueue.subscriptionOptions()).data;
  return queue?.current ? <Favorite song={queue.current} /> : null;
}
