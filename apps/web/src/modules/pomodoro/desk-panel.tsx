import { LoadingSkeleton } from '../../components/ui/loading-skeleton.tsx';
import type { ReactNode } from 'react';
import { useInWidget } from '../../shell/widget-context.ts';
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
  instrument = false,
}: {
  compact?: boolean;
  className?: string;
  tag?: string;
  footer?: ReactNode;
  instrument?: boolean;
}) {
  const timer = usePomodoro(tag);
  const widget = useInWidget();
  const disabled = timer.pending || timer.state === undefined || timer.connectionLost;
  if (instrument) return <InstrumentTimer timer={timer} disabled={disabled} tag={tag} footer={footer} />;
  return (
    <Panel
      title={m.pomodoro_title()}
      className={`${className} ${timer.connectionLost ? 'opacity-60' : ''}`}
      action={<PomodoroSettings settings={timer.state?.settings} />}
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
            {timer.state ? (
              timer.phaseLabel
            ) : timer.connectionLost ? (
              m.tile_unavailable()
            ) : (
              <LoadingSkeleton label={m.tile_loading()} rows={1} className="w-2xl" />
            )}
          </p>
          <TimerDigits timer={timer} readout={widget} dataReadout={widget} />
        </div>
      </div>
      {!compact && (
        <p className="text-caption text-muted-foreground tabular-nums">
          {timer.state ? (
            m.pomodoro_today({ count: timer.state.completedFocusToday })
          ) : (
            <LoadingSkeleton label={m.tile_loading()} rows={1} className="w-2xl" />
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-xs">
        <RegistryButton
          label={tag && timer.primaryAction === 'start' ? m.pomodoro_start_tagged() : timer.primaryLabel}
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

// The total as the timer reads it: a fractional preset (the e2e fake runs 0.1 minutes) printed "0.1:00".
function clock(ms: number) {
  const total = Math.round(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function InstrumentTimer({
  timer,
  disabled,
  tag,
  footer,
}: {
  timer: ReturnType<typeof usePomodoro>;
  disabled: boolean;
  tag?: string;
  footer?: ReactNode;
}) {
  return (
    <section aria-label={m.pomodoro_title()} className="flex flex-col items-center gap-lg">
      <div className="flex w-full justify-between gap-sm text-caps text-muted-foreground">
        <h3>{m.pomodoro_title()}</h3>
        <span className="flex items-center gap-xs">
          {timer.phaseLabel}
          <PomodoroSettings settings={timer.state?.settings} />
        </span>
      </div>
      <progress aria-label={m.pomodoro_progress()} value={timer.progress} max={1} className="sr-only" />
      <div className="instrument-dial">
        <svg viewBox="0 0 100 100" aria-hidden className="pomodoro-ring size-full -rotate-90">
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-xs">
          <TimerDigits timer={timer} readout />
          <span className="text-caps text-muted-foreground">
            {m.pomodoro_instrument_remaining({
              duration: clock(timer.state?.durationMs || (timer.state?.settings.focusMinutes ?? 0) * 60_000),
            })}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-xs">
        {timer.state?.phase !== 'idle' && timer.state && (
          <>
            <RegistryButton secondary label={m.pomodoro_skip()} action={timer.skip} disabled={disabled} />
            <RegistryButton secondary label={m.pomodoro_stop()} action={timer.stop} disabled={disabled} />
          </>
        )}
        <RegistryButton
          label={tag && timer.primaryAction === 'start' ? m.pomodoro_start_tagged() : timer.primaryLabel}
          action={() => timer.act(timer.primaryAction)}
          disabled={disabled}
        />
      </div>
      <p className="text-caps text-muted-foreground">
        {timer.state ? (
          m.pomodoro_today({ count: timer.state.completedFocusToday })
        ) : (
          <LoadingSkeleton label={m.tile_loading()} rows={1} className="w-2xl" />
        )}
      </p>
      {footer && <p className="text-caps text-muted-foreground">{footer}</p>}
      {timer.error && (
        <p role="alert" className="text-caption text-danger">
          {m.pomodoro_error()}
        </p>
      )}
    </section>
  );
}

/** Accessible rolling `MM:SS` readout shared across full, instrument, and Medio Pomodoro views. */
export function TimerDigits({
  timer,
  readout = false,
  dataReadout = false,
}: {
  timer: ReturnType<typeof usePomodoro>;
  readout?: boolean;
  dataReadout?: boolean;
}) {
  return (
    <p
      role="timer"
      aria-label={m.pomodoro_remaining()}
      data-readout={dataReadout ? '' : undefined}
      className={readout ? 'text-readout' : 'text-display tabular-nums'}
    >
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
  );
}
