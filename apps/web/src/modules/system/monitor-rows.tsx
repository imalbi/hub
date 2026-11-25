import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { MonitorIcon } from '@phosphor-icons/react';
import { DeviceRow } from '../../components/device-row.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { Tile } from '../../components/tile.tsx';
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
  const toggle = useMutation(trpc.system.monitor.toggle.mutationOptions());
  const setOrientation = useMutation(trpc.system.monitor.setOrientation.mutationOptions());
  return { monitors: state.data ?? [], toggle, setOrientation, stale: useConnectionLost() };
}

function monitorText({ state, orientation }: Monitor) {
  if (state === 'on' && orientation === 'horizontal') return m.monitor_on_horizontal();
  if (state === 'on' && orientation === 'vertical') return m.monitor_on_vertical();
  return stateText[state]();
}

/** One row of "Questo PC" per configured monitor, with its configured actions. */
export function MonitorRows() {
  const { monitors, toggle, setOrientation, stale } = useMonitors();
  return monitors.map((monitor) => {
    const { output, label, state, orientation, supportsHorizontal, supportsVertical } = monitor;
    const disabled = stale || state === 'absent' || state === 'unknown';
    return (
      <DeviceRow key={output} label={label} state={monitorText(monitor)} stale={stale}>
        <RegistryButton
          secondary
          label={state === 'on' ? m.monitor_turn_off() : m.monitor_turn_on()}
          name={state === 'on' ? m.monitor_turn_off_name({ label }) : m.monitor_turn_on_name({ label })}
          // A monitor that is unplugged or unreadable has nothing to switch.
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
      </DeviceRow>
    );
  });
}

/** One deck tile per configured monitor; the tile of a list that is empty renders nothing, so no hole is left. */
export function MonitorTiles() {
  const { monitors, toggle, stale } = useMonitors();
  return monitors.map((monitor) => {
    const { output, label, state } = monitor;
    return (
      <Tile
        key={output}
        icon={MonitorIcon}
        // Weight is the on/off state, as on the other toggle tiles.
        iconWeight={state === 'on' ? 'fill' : 'regular'}
        label={label}
        state={monitorText(monitor)}
        disabled={state === 'absent' || state === 'unknown'}
        pending={toggle.isPending && toggle.variables?.output === output}
        error={toggle.isError && toggle.variables?.output === output}
        stale={stale}
        onPress={() => toggle.mutate({ output })}
      />
    );
  });
}
