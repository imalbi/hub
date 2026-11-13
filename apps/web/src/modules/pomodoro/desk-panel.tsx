import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Panel } from '../../components/panel.tsx';
import { m } from '../../paraglide/messages.js';
import { usePomodoro } from './use-pomodoro.ts';
import { NumberRoll } from '../../components/ui/number-roll.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { PomodoroSettings } from './settings.tsx';

export function PomodoroPanel({
  compact = false,
  className = '',
  tag,
  footer,
}: {
  compact?: boolean;
  className?: string;
  tag?: string;
  footer?: ReactNode;
}) {
  const timer = usePomodoro(tag);
  const disabled = timer.pending || timer.state === undefined || timer.connectionLost;
  return (
    <Panel
      title={m.pomodoro_title()}
      className={`${className} ${timer.connectionLost ? 'opacity-60' : ''}`}
      action={
        compact ? (
          <Link to="/desk/studio" className="text-caption text-muted-foreground hover:text-foreground">
            {m.zone_open({ zone: m.zone_study() })}
          </Link>
        ) : (
          <PomodoroSettings settings={timer.state?.settings} />
        )
      }
    >
      <progress aria-label={m.pomodoro_progress()} value={timer.progress} max={1} className="sr-only" />
      <div className="flex items-center gap-lg">
        {!compact && (
          <svg viewBox="0 0 100 100" aria-hidden className="pomodoro-ring size-4xl shrink-0">
            <circle cx="50" cy="50" r="46" className="stroke-border" />
            <circle
              cx="50"
              cy="50"
              r="46"
              pathLength="100"
              strokeDasharray="100"
              strokeDashoffset={100 - timer.progress * 100}
              className="stroke-foreground"
            />
          </svg>
        )}
        <div className="flex flex-col gap-xs">
          <p className="text-caption text-muted-foreground">
            {timer.state ? timer.phaseLabel : timer.connectionLost ? m.tile_unavailable() : m.tile_loading()}
          </p>
          <p role="timer" aria-label={m.pomodoro_remaining()} className="text-display tabular-nums">
            <span className="sr-only">{timer.time}</span>
            <span aria-hidden className="select-none">
              {/* Digits mount with the first real value, so arriving at the page is not a change they roll for. */}
              {timer.state ? (
                <>
                  <NumberRoll
                    value={timer.minutes}
                    format={{ minimumIntegerDigits: 2, useGrouping: false }}
                    locales="it"
                    direction="down"
                  />
                  :
                  <NumberRoll
                    value={timer.seconds}
                    format={{ minimumIntegerDigits: 2, useGrouping: false }}
                    locales="it"
                    direction="down"
                  />
                </>
              ) : (
                <span className="invisible">{timer.time}</span>
              )}
            </span>
          </p>
        </div>
      </div>
      {!compact && (
        <p className="text-caption text-muted-foreground tabular-nums">
          {timer.state ? m.pomodoro_today({ count: timer.state.completedFocusToday }) : m.tile_loading()}
        </p>
      )}
      <div className="flex flex-wrap gap-xs">
        <RegistryButton
          label={tag && timer.primaryAction === 'start' ? m.study_start_pomodoro() : timer.primaryLabel}
          action={() => timer.act(timer.primaryAction)}
          disabled={disabled}
        />
        {!compact && timer.state?.phase !== 'idle' && timer.state !== undefined && (
          <>
            <RegistryButton secondary label={m.pomodoro_skip()} action={timer.skip} disabled={disabled} />
            <RegistryButton secondary label={m.pomodoro_stop()} action={timer.stop} disabled={disabled} />
          </>
        )}
      </div>
      {timer.error && (
        <p role="alert" className="text-caption text-danger">
          {m.pomodoro_error()}
        </p>
      )}
      {footer && (
        <p className="border-t border-dashed border-border pt-md text-caption text-muted-foreground tabular-nums">
          {footer}
        </p>
      )}
    </Panel>
  );
}
