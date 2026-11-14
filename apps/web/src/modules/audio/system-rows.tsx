import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import { DeviceRow } from '../../components/device-row.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { Slider } from '../../components/ui/slider.tsx';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';
import { OutputSwitch } from './output-switch.tsx';

/** The rows of the "Audio" panel in Sistema: output, volume, mute and microphone. Each row is a direct child of its list. */
export function AudioRows() {
  const trpc = useTRPC();
  const audio = useSubscription(trpc.audio.onState.subscriptionOptions());
  const stale = useConnectionLost();
  const volume = useMutation(trpc.audio.setVolume.mutationOptions());
  const mute = useMutation(trpc.audio.toggleMute.mutationOptions());
  const micMute = useMutation(trpc.audio.toggleMicMute.mutationOptions());
  // The value under the thumb while dragging; one write on release, as the Luci slider does, so parallel wpctl calls
  // cannot land out of order and leave a value the user did not pick.
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? Math.round((audio.data?.volume ?? 0) * 100);
  const commit = () => {
    if (draft !== null) volume.mutate({ value: draft / 100 }, { onSettled: () => setDraft(null) });
  };
  const loading = stale ? m.tile_unavailable() : m.tile_loading();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-md">
        <span className="text-label">{m.audio_output_label()}</span>
        <OutputSwitch />
      </div>
      <div className="flex items-center gap-lg">
        {/* Touch height on the content, as the buttons give the other rows, so every row is the same height. */}
        <span className="flex min-h-touch w-label-col items-center text-label">{m.audio_volume()}</span>
        <Slider
          label={m.audio_volume()}
          min={0}
          max={100}
          step={1}
          value={shown}
          format={(v) => `${v}%`}
          disabled={!audio.data || stale}
          onValueChange={([val]) => setDraft(val)}
          onValueCommit={commit}
          // The bubble's headroom floats over the row above, so the track lines up with the label and the value.
          className="-mt-xl -mb-xs flex-1"
        />
        <span className="w-2xl text-right text-label tabular-nums">{shown}%</span>
      </div>
      <DeviceRow
        label={m.tile_audio_output()}
        state={audio.data ? (audio.data.muted ? m.audio_output_off() : m.audio_output_on()) : loading}
        stale={stale}
      >
        <RegistryButton
          secondary
          label={m.audio_mute_action()}
          name={m.audio_mute()}
          pressed={audio.data?.muted}
          disabled={!audio.data || stale}
          action={() => mute.mutateAsync()}
        />
      </DeviceRow>
      <DeviceRow
        label={m.audio_microphone()}
        state={audio.data ? (audio.data.micMuted ? m.audio_muted() : m.audio_unmuted()) : loading}
        stale={stale}
      >
        <RegistryButton
          secondary
          label={m.audio_mute_action()}
          name={m.audio_mic_mute()}
          pressed={audio.data?.micMuted}
          disabled={!audio.data || stale}
          action={() => micMute.mutateAsync()}
        />
      </DeviceRow>
    </>
  );
}
