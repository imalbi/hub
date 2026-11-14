import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { MonitorIcon } from '@phosphor-icons/react';
import { DeviceRow } from '../../components/device-row.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { Tile } from '../../components/tile.tsx';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';

type MonitorState = 'on' | 'off' | 'absent' | 'unknown';

const stateText = {
  on: m.monitor_on,
  off: m.monitor_off,
  absent: m.monitor_absent,
  unknown: m.monitor_unknown,
} satisfies Record<MonitorState, () => string>;

/** The configured monitors, live. An empty list (nothing configured) shows nothing anywhere; no data yet is the same. */
function useMonitors() {
  const trpc = useTRPC();
  const state = useSubscription(trpc.system.onMonitors.subscriptionOptions());
  const toggle = useMutation(trpc.system.monitor.toggle.mutationOptions());
  return { monitors: state.data ?? [], toggle, stale: useConnectionLost() };
}

/** One row of "Questo PC" per configured monitor, with a button that turns it on or off. */
export function MonitorRows() {
  const { monitors, toggle, stale } = useMonitors();
  return monitors.map(({ output, label, state }) => (
    <DeviceRow key={output} label={label} state={stateText[state]()} stale={stale}>
      <RegistryButton
        secondary
        label={state === 'on' ? m.monitor_turn_off() : m.monitor_turn_on()}
        name={state === 'on' ? m.monitor_turn_off_name({ label }) : m.monitor_turn_on_name({ label })}
        // A monitor that is unplugged or unreadable has nothing to switch.
        disabled={stale || state === 'absent' || state === 'unknown'}
        action={() => toggle.mutateAsync({ output })}
      />
    </DeviceRow>
  ));
}

/** One deck tile per configured monitor; the tile of a list that is empty renders nothing, so no hole is left. */
export function MonitorTiles() {
  const { monitors, toggle, stale } = useMonitors();
  return monitors.map(({ output, label, state }) => (
    <Tile
      key={output}
      icon={MonitorIcon}
      // Weight is the on/off state, as on the other toggle tiles.
      iconWeight={state === 'on' ? 'fill' : 'regular'}
      label={label}
      state={stateText[state]()}
      disabled={state === 'absent' || state === 'unknown'}
      pending={toggle.isPending && toggle.variables?.output === output}
      error={toggle.isError && toggle.variables?.output === output}
      stale={stale}
      onPress={() => toggle.mutate({ output })}
    />
  ));
}
