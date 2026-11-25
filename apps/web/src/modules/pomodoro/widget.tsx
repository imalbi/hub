import { PauseIcon, PlayIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { PomodoroSettings } from './settings.tsx';
import { Panel } from '../../components/panel.tsx';
import { Readout } from '../../components/readout.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { LoadingSkeleton } from '../../components/ui/loading-skeleton.tsx';
import { useTRPC } from '../../lib/trpc.ts';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';
import { PomodoroPanel, TimerDigits } from './desk-panel.tsx';
import { focusMinutesToday, formatPomodoroTag } from './format.ts';
import { usePomodoro } from './use-pomodoro.ts';

export function PomodoroWidget({ size }: { size: WidgetSize }) {
  if (size === 'large') return <PomodoroPanel className="h-full" />;
  if (size === 'small') return <SmallPomodoro />;
  return <MediumPomodoro />;
}

/** Piccolo (P3): phase state in the header, countdown and daily sessions bottom-left, one play/pause control bottom-right. */
function SmallPomodoro() {
  const timer = usePomodoro();
  const Icon = timer.primaryAction === 'pause' ? PauseIcon : PlayIcon;
  const headerState = timer.state ? (
    <span className="text-muted-foreground">{timer.phaseLabel}</span>
  ) : timer.connectionLost ? (
    <span className="text-muted-foreground">{m.tile_unavailable()}</span>
  ) : (
    <LoadingSkeleton label={m.tile_loading()} rows={1} className="w-2xl" />
  );
  return (
    <Panel
      title={m.pomodoro_title()}
      className={`relative h-full ${timer.connectionLost ? 'opacity-60' : ''}`}
      action={headerState}
    >
      <div className="mt-auto flex items-end justify-between gap-sm">
        <div className="flex min-w-0 flex-col gap-3xs">
          <p>
            <Readout>{timer.time}</Readout>
          </p>
          <p className="truncate text-caption text-muted-foreground tabular-nums">
            {m.pomodoro_sessions_today({ count: timer.state?.completedFocusToday ?? 0 })}
          </p>
        </div>
        <RegistryButton
          iconOnly
          className="relative z-10 shrink-0"
          label={timer.primaryLabel}
          action={() => timer.act(timer.primaryAction)}
          disabled={timer.pending || timer.state === undefined || timer.connectionLost}
          icon={<Icon className="size-icon" aria-hidden />}
        />
      </div>
    </Panel>
  );
}

/** Medio (P4): countdown on the left; current tag, progress track, daily study minutes, and controls on the right. */
function MediumPomodoro() {
  const trpc = useTRPC();
  const timer = usePomodoro();
  const today = useQuery(trpc.pomodoro.today.queryOptions());
  const disabled = timer.pending || timer.state === undefined || timer.connectionLost;
  const tagLabel = formatPomodoroTag(timer.state?.tag);
  const minutes = focusMinutesToday(today.data ?? []);
  const sessionsCount = m.pomodoro_sessions_today({ count: timer.state?.completedFocusToday ?? 0 });
  return (
    <Panel
      title={m.pomodoro_title()}
      className={`h-full ${timer.connectionLost ? 'opacity-60' : ''}`}
      action={<PomodoroSettings settings={timer.state?.settings} />}
    >
      <progress aria-label={m.pomodoro_progress()} value={timer.progress} max={1} className="sr-only" />
      <div className="flex min-h-0 flex-1 items-stretch gap-lg">
        <div className="flex shrink-0 flex-col justify-end gap-2xs border-r border-border pr-lg">
          <TimerDigits timer={timer} readout dataReadout />
          <p className="truncate text-caption text-muted-foreground tabular-nums">
            {timer.state ? (
              `${timer.phaseLabel} · ${sessionsCount}`
            ) : timer.connectionLost ? (
              m.tile_unavailable()
            ) : (
              <LoadingSkeleton label={m.tile_loading()} rows={1} className="w-2xl" />
            )}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-sm">
          <div className="flex min-w-0 items-center justify-between gap-sm">
            <span className="text-caps text-muted-foreground">{m.pomodoro_on_what()}</span>
            <span className="min-w-0 truncate text-label text-foreground">{tagLabel ?? m.pomodoro_untagged()}</span>
          </div>
          <div aria-hidden className="h-2xs w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground"
              style={{ width: `${Math.round(timer.progress * 100)}%` }}
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-xs">
            <span className="truncate text-label text-muted-foreground tabular-nums">
              {m.pomodoro_study_today({ minutes })}
            </span>
            <div className="flex shrink-0 items-center gap-xs">
              {timer.state?.phase !== 'idle' && timer.state !== undefined && (
                <>
                  <RegistryButton secondary label={m.pomodoro_skip()} action={timer.skip} disabled={disabled} />
                  <RegistryButton secondary label={m.pomodoro_stop()} action={timer.stop} disabled={disabled} />
                </>
              )}
              <RegistryButton
                label={timer.primaryLabel}
                action={() => timer.act(timer.primaryAction)}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      </div>
      {timer.error && (
        <p role="alert" className="text-caption text-danger">
          {m.pomodoro_error()}
        </p>
      )}
    </Panel>
  );
}
