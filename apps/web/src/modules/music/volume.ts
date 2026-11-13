import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc.ts';

/** The music-only volume (mpv's own, not the system's): read from `music.state`, written on release. */
export function useMusicVolume() {
  const trpc = useTRPC();
  const client = useQueryClient();
  const state = useQuery(trpc.music.state.queryOptions());
  const set = useMutation(
    trpc.music.setVolume.mutationOptions({
      onSuccess: (_, { volume }) =>
        client.setQueryData(trpc.music.state.queryKey(), (old) => (old ? { ...old, volume } : old)),
    }),
  );
  return { volume: state.data?.volume ?? null, set: (volume: number) => set.mutateAsync({ volume }) };
}
