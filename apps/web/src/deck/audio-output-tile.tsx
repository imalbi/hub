import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Volume2 } from 'lucide-react';
import { Tile } from '../components/tile.tsx';
import { m } from '../paraglide/messages.js';
import { STATE_REFETCH_MS, useTRPC } from '../trpc.ts';

export function AudioOutputTile() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const audio = useQuery({ ...trpc.audio.state.queryOptions(), refetchInterval: STATE_REFETCH_MS });
  const cycleOutput = useMutation(
    trpc.audio.cycleOutput.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.audio.state.queryKey() }),
    }),
  );

  function stateText() {
    if (audio.data) return audio.data.current?.label ?? m.audio_output_none();
    return audio.isError ? m.tile_unavailable() : m.tile_loading();
  }

  return (
    <Tile
      icon={Volume2}
      label={m.tile_audio_output()}
      state={stateText()}
      pending={cycleOutput.isPending}
      error={cycleOutput.isError}
      onPress={() => cycleOutput.mutate()}
    />
  );
}
