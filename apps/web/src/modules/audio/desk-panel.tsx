import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { NumberRoll } from '../../components/ui/number-roll.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { Link } from '@tanstack/react-router';
import { useSubscription } from '@trpc/tanstack-react-query';
import { Panel } from '../../components/panel.tsx';
import { m } from '../../paraglide/messages.js';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import { OutputSwitch } from './output-switch.tsx';
export function AudioPanel({
  compact = false,
  controls = false,
  className = '',
}: {
  compact?: boolean;
  controls?: boolean;
  className?: string;
}) {
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
  return (
    <Panel
      title={m.tile_audio_output()}
      className={`${className} ${stale ? 'opacity-60' : ''}`}
      action={
        compact ? (
          <Link to="/desk/media" className="text-caption text-muted-foreground hover:text-foreground">
            {m.zone_open({ zone: m.zone_media() })}
          </Link>
        ) : undefined
      }
    >
      <p className="text-title">
        {audio.data
          ? (audio.data.current?.label ?? m.audio_output_none())
          : stale
            ? m.tile_unavailable()
            : m.tile_loading()}
      </p>
      {!controls && audio.data && (
        <NumberRoll className="text-display" value={Math.round(audio.data.volume * 100)} suffix="%" />
      )}
      {!compact && <OutputSwitch />}
      {controls && (
        <>
          <label className="flex flex-col gap-xs">
            <span>
              {m.audio_volume()}: {shown}%
            </span>
            <input
              className="accent-primary"
              aria-label={m.audio_volume()}
              type="range"
              min="0"
              max="100"
              value={shown}
              aria-valuetext={`${shown}%`}
              disabled={!audio.data || stale}
              onChange={(event) => setDraft(Number(event.target.value))}
              onPointerUp={commit}
              onKeyUp={commit}
              onBlur={commit}
            />
          </label>
          <div className="flex flex-wrap gap-xs">
            <RegistryButton
              secondary
              label={m.audio_mute()}
              pressed={audio.data?.muted}
              disabled={!audio.data || stale}
              action={() => mute.mutateAsync()}
            />
            <RegistryButton
              secondary
              label={m.audio_mic_mute()}
              pressed={audio.data?.micMuted}
              disabled={!audio.data || stale}
              action={() => micMute.mutateAsync()}
            />
          </div>
        </>
      )}
    </Panel>
  );
}
