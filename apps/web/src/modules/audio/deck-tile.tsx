import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { SpeakerHighIcon } from '@phosphor-icons/react';
import { Tile } from '../../components/tile.tsx';
import { m } from '../../paraglide/messages.js';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';

export function AudioOutputTile() {
  const trpc = useTRPC();
  const connectionLost = useConnectionLost();
  const audio = useSubscription(trpc.audio.onState.subscriptionOptions());
  // The server pushes the new state after the action, so there is nothing to invalidate here.
  const cycleOutput = useMutation(trpc.audio.cycleOutput.mutationOptions());

  function stateText() {
    if (audio.data) return audio.data.current?.label ?? m.audio_output_none();
    return connectionLost ? m.tile_unavailable() : m.tile_loading();
  }

  return (
    <Tile
      icon={SpeakerHighIcon}
      label={m.tile_audio_output()}
      state={stateText()}
      pending={cycleOutput.isPending}
      error={cycleOutput.isError}
      stale={connectionLost}
      onPress={() => cycleOutput.mutate()}
    />
  );
}
