import { useState } from 'react';
import { useSubscription } from '@trpc/tanstack-react-query';
import { HeadphonesIcon } from '@phosphor-icons/react';
import { Popover } from '../../components/ui/popover.tsx';
import { Slider } from '../../components/ui/slider.tsx';
import { useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';
import { OutputSwitch } from '../audio/output-switch.tsx';

export type MusicVolume = { volume: number | null; onVolume: (volume: number) => Promise<unknown> };

function VolumeSlider({ volume, onVolume }: MusicVolume) {
  // The value under the thumb while dragging; one write on release (parallel writes could land out of order).
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? volume ?? 0;
  return (
    <div className="flex flex-col gap-sm">
      {/* The slider's own bubble says the value; the bar button says it too. */}
      <span className="text-label text-muted-foreground">{m.music_volume()}</span>
      <Slider
        label={m.music_volume()}
        min={0}
        max={100}
        value={shown}
        format={(v) => `${v}%`}
        disabled={volume === null}
        onValueChange={([next]) => setDraft(next ?? null)}
        onValueCommit={([next]) => {
          if (next !== undefined) void onVolume(next).finally(() => setDraft(null));
        }}
      />
      <span className="text-caption text-muted-foreground">{m.music_volume_note()}</span>
    </div>
  );
}

/**
 * The player's one audio button: the output and, when Musica is on, the music volume ("Cuffie 70%"). It opens the output
 * switch and the volume slider; the system volume stays on Sistema.
 */
export function AudioButton({ music }: { music?: MusicVolume }) {
  const trpc = useTRPC();
  const audio = useSubscription(trpc.audio.onState.subscriptionOptions());
  const output = audio.data?.current?.label ?? m.media_audio_none();
  const volume = music?.volume ?? null;
  return (
    <Popover
      label={m.media_audio()}
      side="top"
      align="end"
      trigger={
        <button
          type="button"
          aria-label={
            volume === null ? m.media_audio_label({ output }) : m.media_audio_label_volume({ output, volume })
          }
          className="flex h-touch shrink-0 items-center gap-xs rounded-full bg-muted px-md text-label focus-visible:outline-2 focus-visible:outline-ring"
        >
          <HeadphonesIcon className="size-icon" aria-hidden="true" />
          {output}
          {volume !== null && <span className="text-muted-foreground tabular-nums">{volume}%</span>}
        </button>
      }
    >
      <div className="flex flex-col gap-lg p-xs">
        <div className="flex flex-col gap-xs">
          <span className="text-label text-muted-foreground">{m.media_audio_output()}</span>
          <OutputSwitch />
        </div>
        {music && <VolumeSlider {...music} />}
      </div>
    </Popover>
  );
}
