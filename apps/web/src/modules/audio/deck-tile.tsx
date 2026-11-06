import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { SpeakerHighIcon, SpeakerLowIcon, MicrophoneIcon, MicrophoneSlashIcon } from '@phosphor-icons/react';
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

function VolumeTile({ direction }: { direction: 'up' | 'down' }) {
  const trpc = useTRPC();
  const audio = useSubscription(trpc.audio.onState.subscriptionOptions());
  const step = useMutation(trpc.audio.stepVolume.mutationOptions());
  const stale = useConnectionLost();
  return (
    <Tile
      icon={direction === 'up' ? SpeakerHighIcon : SpeakerLowIcon}
      label={direction === 'up' ? m.audio_volume_up() : m.audio_volume_down()}
      state={audio.data ? `${Math.round(audio.data.volume * 100)}%` : m.tile_loading()}
      pending={step.isPending}
      error={step.isError}
      disabled={!audio.data || stale}
      stale={stale}
      onPress={() => step.mutate({ direction })}
    />
  );
}
export const VolumeDownTile = () => <VolumeTile direction="down" />;
export const VolumeUpTile = () => <VolumeTile direction="up" />;

export function MicMuteTile() {
  const trpc = useTRPC();
  const audio = useSubscription(trpc.audio.onState.subscriptionOptions());
  const mute = useMutation(trpc.audio.toggleMicMute.mutationOptions());
  const stale = useConnectionLost();
  return (
    <Tile
      icon={audio.data?.micMuted ? MicrophoneSlashIcon : MicrophoneIcon}
      label={m.audio_microphone()}
      state={audio.data ? (audio.data.micMuted ? m.audio_muted() : m.audio_unmuted()) : m.tile_loading()}
      pending={mute.isPending}
      error={mute.isError}
      disabled={!audio.data || stale}
      stale={stale}
      onPress={() => mute.mutate()}
    />
  );
}
