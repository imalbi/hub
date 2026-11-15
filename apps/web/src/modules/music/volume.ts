import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTRPC } from '../../lib/trpc.ts';

/**
 * The music-only volume (mpv's own, not the system's): read from `music.state`, written on release. `songId` is the
 * queue's current song: a new one means mpv is up, so the volume is read again (a first read with mpv down left it
 * null and the slider disabled until a reload, when the song was started from the palette, a playlist or the deck).
 */
export function useMusicVolume(songId: string | undefined) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const state = useQuery(trpc.music.state.queryOptions());
  const { refetch } = state;
  useEffect(() => {
    if (songId) void refetch();
  }, [songId, refetch]);
  const set = useMutation(
    trpc.music.setVolume.mutationOptions({
      onSuccess: (_, { volume }) =>
        client.setQueryData(trpc.music.state.queryKey(), (old) => (old ? { ...old, volume } : old)),
    }),
  );
  return { volume: state.data?.volume ?? null, set: (volume: number) => set.mutateAsync({ volume }) };
}
