import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { MonitorIcon } from '@phosphor-icons/react';
import { DeviceRow } from '../../components/device-row.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { Tile } from '../../components/tile.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';

type Monitor = ReturnType<typeof useMonitors>['monitors'][number];

const stateText = {
  on: m.monitor_on,
  off: m.monitor_off,
  absent: m.monitor_absent,
  unknown: m.monitor_unknown,
} satisfies Record<Monitor['state'], () => string>;

/** The configured monitors, live. An empty list (nothing configured) shows nothing anywhere; no data yet is the same. */
function useMonitors() {
  const trpc = useTRPC();
  const state = useSubscription(trpc.system.onMonitors.subscriptionOptions());
  return { monitors: state.data ?? [], stale: useConnectionLost() };
}

function monitorText({ state, orientation }: Monitor) {
  if (state === 'on' && orientation === 'horizontal') return m.monitor_on_horizontal();
  if (state === 'on' && orientation === 'vertical') return m.monitor_on_vertical();
  return stateText[state]();
}

function MonitorControls({ monitor, stale }: { monitor: Monitor; stale: boolean }) {
  const trpc = useTRPC();
  const toggle = useMutation(trpc.system.monitor.toggle.mutationOptions());
  const setOrientation = useMutation(trpc.system.monitor.setOrientation.mutationOptions());
  const { output, label, state, orientation, supportsHorizontal, supportsVertical } = monitor;
  const disabled = stale || state === 'absent' || state === 'unknown';
  return (
    <>
      <RegistryButton
        secondary
        label={state === 'on' ? m.monitor_turn_off() : m.monitor_turn_on()}
        name={state === 'on' ? m.monitor_turn_off_name({ label }) : m.monitor_turn_on_name({ label })}
        disabled={disabled}
        action={() => toggle.mutateAsync({ output })}
      />
      {supportsHorizontal && (
        <RegistryButton
          secondary
          label={m.monitor_horizontal()}
          name={m.monitor_horizontal_name({ label })}
          disabled={disabled || orientation === 'horizontal'}
          action={() => setOrientation.mutateAsync({ output, orientation: 'horizontal' })}
        />
      )}
      {supportsVertical && (
        <RegistryButton
          secondary
          label={m.monitor_vertical()}
          name={m.monitor_vertical_name({ label })}
          disabled={disabled || orientation === 'vertical'}
          action={() => setOrientation.mutateAsync({ output, orientation: 'vertical' })}
        />
      )}
    </>
  );
}

/** One row of "Questo PC" per configured monitor, with its configured actions. */
export function MonitorRows() {
  const { monitors, stale } = useMonitors();
  return monitors.map((monitor) => (
    <DeviceRow key={monitor.output} label={monitor.label} state={monitorText(monitor)} stale={stale}>
      <MonitorControls monitor={monitor} stale={stale} />
    </DeviceRow>
  ));
}

/** One deck tile per configured monitor, opening the same controls as the desk row. */
export function MonitorTiles() {
  const { monitors, stale } = useMonitors();
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const selectedMonitor = monitors.find((monitor) => monitor.output === selected);
  return (
    <>
      {monitors.map((monitor) => (
        <Tile
          key={monitor.output}
          icon={MonitorIcon}
          iconWeight={monitor.state === 'on' ? 'fill' : 'regular'}
          label={monitor.label}
          state={monitorText(monitor)}
          disabled={monitor.state === 'absent' || monitor.state === 'unknown'}
          stale={stale}
          onPress={() => {
            setSelected(monitor.output);
            setOpen(true);
          }}
        />
      ))}
      {selectedMonitor && (
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title={selectedMonitor.label}
          description={monitorText(selectedMonitor)}
          closeLabel={m.monitor_close()}
          size="sm"
        >
          <div className="flex flex-col gap-xs">
            <MonitorControls key={selectedMonitor.output} monitor={selectedMonitor} stale={stale} />
          </div>
        </Dialog>
      )}
    </>
  );
}
