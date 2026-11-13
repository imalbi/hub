import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import {
  GaugeIcon,
  SquaresFourIcon,
  LockIcon,
  ChatCircleIcon,
  MoonIcon,
  MusicNotesIcon,
  PowerIcon,
  ArrowCounterClockwiseIcon,
} from '@phosphor-icons/react';
import { HoldTile } from '../../components/hold-tile.tsx';
import { Tile } from '../../components/tile.tsx';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';
import { powerText } from './power-text.ts';

export function LockTile() {
  const trpc = useTRPC();
  const lock = useMutation(trpc.system.lock.mutationOptions());
  return (
    <Tile
      icon={LockIcon}
      label={m.system_lock()}
      state={m.system_lock_state()}
      pending={lock.isPending}
      error={lock.isError}
      stale={useConnectionLost()}
      onPress={() => lock.mutate()}
    />
  );
}

function WorkspaceTile({ name }: { name: 'communication' | 'music' | 'hub' }) {
  const trpc = useTRPC();
  const toggle = useMutation(trpc.system.toggleWorkspace.mutationOptions());
  return (
    <Tile
      icon={name === 'hub' ? SquaresFourIcon : name === 'music' ? MusicNotesIcon : ChatCircleIcon}
      label={name === 'hub' ? m.system_hub() : name === 'music' ? m.system_music_app() : m.system_communication()}
      state={m.system_toggle_state()}
      pending={toggle.isPending}
      error={toggle.isError}
      stale={useConnectionLost()}
      onPress={() => toggle.mutate({ name })}
    />
  );
}

export const HubTile = () => <WorkspaceTile name="hub" />;
export const CommunicationTile = () => <WorkspaceTile name="communication" />;
export const MusicAppTile = () => <WorkspaceTile name="music" />;

/** Not a button: there is nothing to do with a reading. */
export function PowerTile() {
  const trpc = useTRPC();
  const power = useSubscription(trpc.system.onPower.subscriptionOptions());
  const { figure, today } = powerText(power.data);
  return (
    <div
      className={`flex flex-col items-start gap-xs rounded-lg border border-border bg-surface p-md ${useConnectionLost() ? 'opacity-60' : ''}`}
    >
      <GaugeIcon className="size-icon" aria-hidden />
      <span className="text-label tabular-nums">
        <span className="sr-only">{m.power_title()}: </span>
        {figure ?? m.power_not_measured()}
      </span>
      <span className="line-clamp-2 text-caption text-muted-foreground tabular-nums">{today}</span>
    </div>
  );
}

export function SuspendTile() {
  const trpc = useTRPC();
  const suspend = useMutation(trpc.system.suspend.mutationOptions());
  return (
    <HoldTile
      icon={MoonIcon}
      label={m.system_suspend()}
      holdLabel={m.system_suspend_hold()}
      onConfirm={() => suspend.mutateAsync({ confirmed: true })}
    />
  );
}

export function RebootTile() {
  const trpc = useTRPC();
  const reboot = useMutation(trpc.system.reboot.mutationOptions());
  return (
    <HoldTile
      icon={ArrowCounterClockwiseIcon}
      label={m.system_reboot()}
      holdLabel={m.system_reboot_hold()}
      onConfirm={() => reboot.mutateAsync({ confirmed: true })}
    />
  );
}

export function PowerOffTile() {
  const trpc = useTRPC();
  const powerOff = useMutation(trpc.system.powerOff.mutationOptions());
  return (
    <HoldTile
      icon={PowerIcon}
      label={m.system_power_off()}
      holdLabel={m.system_power_off_hold()}
      onConfirm={() => powerOff.mutateAsync({ confirmed: true })}
    />
  );
}
