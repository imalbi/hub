import { Link } from '@tanstack/react-router';
import { Panel } from '../../components/panel.tsx';
import { m } from '../../paraglide/messages.js';
import { usePomodoro } from './use-pomodoro.ts';
import { NumberRoll } from '../../components/ui/number-roll.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { useId } from 'react';

export function PomodoroPanel({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const timer = usePomodoro();
  const timeId = useId();
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
        ) : undefined
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
          <p
            role="timer"
            aria-label={m.pomodoro_remaining()}
            aria-describedby={timeId}
            aria-live="off"
            className="text-display tabular-nums"
          >
            <output id={timeId} aria-label={timer.time} aria-live="off" className="sr-only">
              {timer.time}
            </output>
            <span aria-hidden className="select-none">
              <NumberRoll
                value={Number(timer.time.split(':')[0])}
                format={{ minimumIntegerDigits: 2, useGrouping: false }}
                locales="it"
                direction="down"
              />
              :
              <NumberRoll
                value={Number(timer.time.split(':')[1])}
                format={{ minimumIntegerDigits: 2, useGrouping: false }}
                locales="it"
                direction="down"
              />
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
          label={timer.primaryLabel}
          action={() => timer.actAsync(timer.primaryAction)}
          disabled={disabled}
        />
        {!compact && timer.state?.phase !== 'idle' && timer.state !== undefined && (
          <>
            <RegistryButton
              secondary
              label={m.pomodoro_skip()}
              action={() => timer.actAsync('skip')}
              disabled={disabled}
            />
            <RegistryButton
              secondary
              label={m.pomodoro_stop()}
              action={() => timer.actAsync('stop')}
              disabled={disabled}
            />
          </>
        )}
      </div>
      {timer.error && (
        <p role="alert" className="text-caption text-danger">
          {m.pomodoro_error()}
        </p>
      )}
    </Panel>
  );
}
