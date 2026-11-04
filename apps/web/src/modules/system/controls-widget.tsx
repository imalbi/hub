import { useMutation } from '@tanstack/react-query';
import { HoldButton } from '../../components/hold-button.tsx';
import { Panel } from '../../components/panel.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { useTRPC } from '../../lib/trpc.ts';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';

/** Lock and the two workspaces as plain buttons; suspend, reboot and power off only by holding. */
export function ControlsWidget({ size }: { size: WidgetSize }) {
  const trpc = useTRPC();
  const lock = useMutation(trpc.system.lock.mutationOptions());
  const toggle = useMutation(trpc.system.toggleWorkspace.mutationOptions());
  const suspend = useMutation(trpc.system.suspend.mutationOptions());
  const reboot = useMutation(trpc.system.reboot.mutationOptions());
  const powerOff = useMutation(trpc.system.powerOff.mutationOptions());
  return (
    <Panel title={m.system_controls()} className="h-full">
      <div className={`flex gap-lg ${size === 'large' ? 'flex-col' : 'flex-wrap items-center justify-between'}`}>
        <div className="flex flex-wrap gap-xs">
          <RegistryButton label={m.system_lock()} action={() => lock.mutateAsync()} />
          <RegistryButton
            secondary
            label={m.system_communication()}
            action={() => toggle.mutateAsync({ name: 'communication' })}
          />
          <RegistryButton secondary label={m.system_music_app()} action={() => toggle.mutateAsync({ name: 'music' })} />
        </div>
        <fieldset className="flex flex-wrap gap-xs">
          <legend className="sr-only">{m.system_power_group()}</legend>
          <HoldButton
            label={m.system_suspend_hold()}
            idle={m.system_suspend()}
            done={m.system_power_done()}
            outline
            onConfirm={() => suspend.mutateAsync({ confirmed: true })}
          />
          <HoldButton
            label={m.system_reboot_hold()}
            idle={m.system_reboot()}
            done={m.system_power_done()}
            outline
            onConfirm={() => reboot.mutateAsync({ confirmed: true })}
          />
          <HoldButton
            label={m.system_power_off_hold()}
            idle={m.system_power_off()}
            done={m.system_power_done()}
            outline
            onConfirm={() => powerOff.mutateAsync({ confirmed: true })}
          />
        </fieldset>
      </div>
    </Panel>
  );
}
