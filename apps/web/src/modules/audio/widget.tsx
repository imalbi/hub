import { Readout } from '../../components/readout.tsx';
import { useSubscription } from '@trpc/tanstack-react-query';
import { NumberRoll } from '../../components/ui/number-roll.tsx';
import { Panel } from '../../components/panel.tsx';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';
import { AudioPanel } from './desk-panel.tsx';
import { OutputSwitch } from './output-switch.tsx';

/** Small shows the current output large; medium has room for the list and the switch; wide is the compact panel. */
export function AudioWidget({ size }: { size: WidgetSize }) {
  if (size === 'small') return <SmallAudio />;
  return <AudioPanel compact={size === 'wide'} className="h-full" />;
}

function SmallAudio() {
  const trpc = useTRPC();
  const audio = useSubscription(trpc.audio.onState.subscriptionOptions());
  const stale = useConnectionLost();
  return (
    <Panel title={m.tile_audio_output()} className={`h-full ${stale ? 'opacity-60' : ''}`}>
      <div className="mt-auto flex items-end justify-between gap-xs">
        <p className="text-heading break-words">
          {audio.data
            ? (audio.data.current?.label ?? m.audio_output_none())
            : stale
              ? m.tile_unavailable()
              : m.tile_loading()}
        </p>
        {audio.data && (
          <Readout>
            <NumberRoll value={Math.round(audio.data.volume * 100)} suffix="%" />
          </Readout>
        )}
      </div>
      <OutputSwitch />
    </Panel>
  );
}
