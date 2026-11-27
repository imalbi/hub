import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import { SpeakerHighIcon, SpeakerSlashIcon, MicrophoneIcon, MicrophoneSlashIcon } from '@phosphor-icons/react';
import { Tile } from '../../components/tile.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { Slider } from '../../components/ui/slider.tsx';
import { m } from '../../paraglide/messages.js';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import { OutputSwitch } from './output-switch.tsx';

export function AudioControlTile() {
  const trpc = useTRPC();
  const stale = useConnectionLost();
  const audio = useSubscription(trpc.audio.onState.subscriptionOptions());
  const volume = useMutation(trpc.audio.setVolume.mutationOptions());
  const mute = useMutation(trpc.audio.toggleMute.mutationOptions());
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? Math.round((audio.data?.volume ?? 0) * 100);
  const disabled = !audio.data || stale;
  const output = audio.data?.current?.label ?? m.audio_output_none();
  const state = stale
    ? m.tile_unavailable()
    : !audio.data
      ? m.tile_loading()
      : audio.data.muted
        ? m.audio_output_off()
        : `${output} · ${Math.round(audio.data.volume * 100)}%`;

  return (
    <>
      <Tile
        icon={audio.data?.muted ? SpeakerSlashIcon : SpeakerHighIcon}
        label={m.audio_control()}
        state={state}
        disabled={disabled}
        stale={stale}
        onPress={() => setOpen(true)}
      />
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="sm"
        title={audio.data?.current?.label ?? m.audio_control()}
        closeLabel={m.audio_close()}
      >
        <div className="flex flex-col gap-md">
          <OutputSwitch />
          <div className="flex items-center justify-between gap-md">
            <span>{m.audio_volume()}</span>
            <span className="tabular-nums">{shown}%</span>
          </div>
          <Slider
            label={m.audio_volume()}
            min={0}
            max={100}
            step={1}
            value={shown}
            format={(value) => `${value}%`}
            disabled={disabled}
            onValueChange={([value]) => setDraft(value)}
            onValueCommit={([value]) => {
              if (value !== undefined) volume.mutate({ value: value / 100 }, { onSettled: () => setDraft(null) });
            }}
          />
          {volume.isError && (
            <p role="alert" className="text-caption text-danger">
              {m.tile_error()}
            </p>
          )}
          <RegistryButton
            secondary
            label={m.audio_mute_action()}
            name={m.audio_mute()}
            pressed={audio.data?.muted}
            disabled={disabled}
            action={() => mute.mutateAsync()}
          />
        </div>
      </Dialog>
    </>
  );
}

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
