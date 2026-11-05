import { PauseIcon, PlayIcon } from '@phosphor-icons/react';
import { Panel } from '../../components/panel.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';
import { PomodoroPanel } from './desk-panel.tsx';
import { usePomodoro } from './use-pomodoro.ts';

export function PomodoroWidget({ size }: { size: WidgetSize }) {
  if (size === 'large') return <PomodoroPanel className="h-full" />;
  if (size === 'small') return <SmallPomodoro />;
  return <PomodoroPanel compact className="h-full" />;
}

/** Phase, time and the one action that fits: start, pause or resume. */
function SmallPomodoro() {
  const timer = usePomodoro();
  const Icon = timer.primaryAction === 'pause' ? PauseIcon : PlayIcon;
  return (
    <Panel title={m.pomodoro_title()} className={`h-full ${timer.connectionLost ? 'opacity-60' : ''}`}>
      <p className="text-caption text-muted-foreground">
        {timer.state ? timer.phaseLabel : timer.connectionLost ? m.tile_unavailable() : m.tile_loading()}
      </p>
      <div className="mt-auto flex items-end justify-between gap-sm">
        <p className="text-display tabular-nums">{timer.time}</p>
        <RegistryButton
          iconOnly
          label={timer.primaryLabel}
          action={() => timer.act(timer.primaryAction)}
          disabled={timer.pending || timer.state === undefined || timer.connectionLost}
          icon={<Icon className="size-icon" aria-hidden />}
        />
      </div>
    </Panel>
  );
}
