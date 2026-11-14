import { useMutation, useQuery } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { DeviceRow } from '../../components/device-row.tsx';
import { HoldButton } from '../../components/hold-button.tsx';
import { Panel } from '../../components/panel.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { useLiveModuleUIs } from '../../lib/enabled-modules.ts';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';
import { AudioRows } from '../audio/system-rows.tsx';
import { MonitorRows } from './monitor-rows.tsx';
import { powerText } from './power-text.ts';
import { uptimeText } from './uptime.ts';
import { WebcamRow } from './webcam.tsx';

// Rows are direct children of the list: each draws a dashed line above itself, and a row that renders nothing leaves no line.
const rows = 'flex flex-col [&>*]:border-t [&>*]:border-dashed [&>*]:border-border [&>*]:py-xs';

function LockRow() {
  const trpc = useTRPC();
  const lock = useMutation(trpc.system.lock.mutationOptions());
  return (
    <DeviceRow label={m.system_lock_row()} state={m.system_lock_detail()}>
      <RegistryButton secondary label={m.system_lock()} action={() => lock.mutateAsync()} />
    </DeviceRow>
  );
}

function WorkspaceRow({ name }: { name: 'communication' | 'music' }) {
  const trpc = useTRPC();
  const toggle = useMutation(trpc.system.toggleWorkspace.mutationOptions());
  const chat = name === 'communication';
  const label = chat ? m.system_communication() : m.system_music_app();
  return (
    <DeviceRow label={label} state={chat ? m.system_chat_detail() : m.system_music_detail()}>
      <RegistryButton
        secondary
        label={m.system_toggle_action()}
        name={m.system_toggle_name({ action: m.system_toggle_action(), label })}
        action={() => toggle.mutateAsync({ name })}
      />
    </DeviceRow>
  );
}

function ModuleRows() {
  return useLiveModuleUIs().flatMap((module) =>
    [module.systemRows ?? []].flat().map((Row, index) => <Row key={`${module.name}-${index}`} />),
  );
}

/** The three power actions, each only by holding; equal widths on one line. */
function PowerHolds() {
  const trpc = useTRPC();
  const suspend = useMutation(trpc.system.suspend.mutationOptions());
  const reboot = useMutation(trpc.system.reboot.mutationOptions());
  const powerOff = useMutation(trpc.system.powerOff.mutationOptions());
  return (
    <fieldset className="mt-auto flex flex-col gap-sm border-t border-dashed border-border pt-md">
      <legend className="sr-only">{m.system_power_group()}</legend>
      <span aria-hidden className="text-caption text-muted-foreground">
        {m.system_power_legend()}
      </span>
      <div className="flex gap-xs">
        <HoldButton
          label={m.system_suspend_hold()}
          idle={m.system_suspend()}
          done={m.system_power_done()}
          outline
          className="flex-1"
          onConfirm={() => suspend.mutateAsync({ confirmed: true })}
        />
        <HoldButton
          label={m.system_reboot_hold()}
          idle={m.system_reboot()}
          done={m.system_power_done()}
          outline
          className="flex-1"
          onConfirm={() => reboot.mutateAsync({ confirmed: true })}
        />
        <HoldButton
          label={m.system_power_off_hold()}
          idle={m.system_power_off()}
          done={m.system_power_done()}
          outline
          className="flex-1"
          onConfirm={() => powerOff.mutateAsync({ confirmed: true })}
        />
      </div>
    </fieldset>
  );
}

function Figure({ label, caption, children }: { label: string; caption?: string; children: string }) {
  return (
    <section aria-label={label} className="flex min-w-0 flex-col gap-3xs">
      <p className="text-caption text-muted-foreground tabular-nums">{caption ?? label}</p>
      <p className="text-display tabular-nums">{children}</p>
    </section>
  );
}

/** The two readings at the foot of Audio. Without a powerstat directory Consumo is not there and Server takes the row. */
function Readings() {
  const trpc = useTRPC();
  const power = useSubscription(trpc.system.onPower.subscriptionOptions());
  const health = useQuery(trpc.health.queryOptions());
  const stale = useConnectionLost();
  const { figure, today } = powerText(power.data);
  const server = health.data
    ? uptimeText(health.data.uptime)
    : health.error
      ? m.server_unreachable()
      : m.server_connecting();
  return (
    <div
      className={`mt-auto grid gap-lg border-t border-dashed border-border pt-md ${power.data === null ? 'grid-cols-1' : 'grid-cols-2'} ${stale ? 'opacity-60' : ''}`}
    >
      {power.data !== null && (
        <Figure label={m.power_title()} caption={m.power_label_today({ today })}>
          {figure ?? m.power_not_measured()}
        </Figure>
      )}
      <Figure label={m.server_panel_title()}>{server}</Figure>
    </div>
  );
}

/** Sistema in two inner panels of dashed rows (board "Righe", step 34): this PC, and audio with the readings at its foot. */
export function SystemTab() {
  return (
    <div className="grid flex-1 grid-cols-2 gap-lg">
      <Panel title={m.system_this_pc()} className="gap-sm">
        <div className={rows}>
          <LockRow />
          <WorkspaceRow name="communication" />
          <WorkspaceRow name="music" />
          <WebcamRow />
          <MonitorRows />
          <ModuleRows />
        </div>
        <PowerHolds />
      </Panel>
      <Panel title={m.audio_panel_title()} className="gap-sm">
        <div className={rows}>
          <AudioRows />
        </div>
        <Readings />
      </Panel>
    </div>
  );
}
