import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pause, Play } from 'lucide-react';
import { Tile } from '../components/tile.tsx';
import { m } from '../paraglide/messages.js';
import { STATE_REFETCH_MS, useTRPC } from '../trpc.ts';

export function MediaTile() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const media = useQuery({ ...trpc.media.state.queryOptions(), refetchInterval: STATE_REFETCH_MS });
  const playPause = useMutation(
    trpc.media.playPause.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.media.state.queryKey() }),
    }),
  );

  function stateText() {
    if (media.data === undefined) return media.isError ? m.tile_unavailable() : m.tile_loading();
    if (media.data === null || !media.data.title) return m.media_nothing_playing();
    return media.data.artist ? m.media_track(media.data) : media.data.title;
  }

  return (
    <Tile
      // The icon is the action a tap performs, like a transport control.
      icon={media.data?.status === 'Playing' ? Pause : Play}
      label={m.tile_media()}
      state={stateText()}
      pending={playPause.isPending}
      error={playPause.isError}
      onPress={() => playPause.mutate()}
    />
  );
}
