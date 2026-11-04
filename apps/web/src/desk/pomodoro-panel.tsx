import { m } from '../paraglide/messages.js';
import { usePomodoro } from '../pomodoro.ts';

export function PomodoroPanel() {
  const timer = usePomodoro();
  const disabled = timer.pending || timer.state === undefined || timer.connectionLost;
  return (
    <section
      aria-labelledby="pomodoro-title"
      className={`flex flex-col gap-lg rounded-xl border border-border bg-surface p-lg ${timer.connectionLost ? 'opacity-60' : ''}`}
    >
      <h2 id="pomodoro-title" className="text-title">
        {m.pomodoro_title()}
      </h2>
      <progress aria-label={m.pomodoro_progress()} value={timer.progress} max={1} className="sr-only" />
      <div className="flex items-center gap-lg">
        <svg viewBox="0 0 100 100" aria-hidden className="pomodoro-ring size-4xl shrink-0">
          <circle cx="50" cy="50" r="46" className="stroke-muted" />
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
        <div className="flex flex-col gap-xs">
          <p className="text-caption text-muted-foreground">
            {timer.state ? timer.phaseLabel : timer.connectionLost ? m.tile_unavailable() : m.tile_loading()}
          </p>
          <p role="timer" aria-label={m.pomodoro_remaining()} aria-live="off" className="text-display tabular-nums">
            {timer.time}
          </p>
        </div>
      </div>
      <p className="text-caption text-muted-foreground tabular-nums">
        {timer.state ? m.pomodoro_today({ count: timer.state.completedFocusToday }) : m.tile_loading()}
      </p>
      <div className="flex flex-wrap gap-xs">
        <button
          type="button"
          disabled={disabled}
          aria-busy={timer.pending}
          onClick={() => timer.act(timer.primaryAction)}
          className="min-h-touch rounded-full bg-primary px-md py-xs text-label text-primary-foreground hover:opacity-80 focus-visible:outline focus-visible:outline-accent disabled:opacity-60"
        >
          {timer.primaryLabel}
        </button>
        {timer.state?.phase !== 'idle' && timer.state !== undefined && (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => timer.act('skip')}
              className="min-h-touch rounded-full border border-border px-md py-xs text-label hover:bg-surface-raised focus-visible:outline focus-visible:outline-accent disabled:opacity-60"
            >
              {m.pomodoro_skip()}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => timer.act('stop')}
              className="min-h-touch rounded-full border border-border px-md py-xs text-label hover:bg-surface-raised focus-visible:outline focus-visible:outline-accent disabled:opacity-60"
            >
              {m.pomodoro_stop()}
            </button>
          </>
        )}
      </div>
      {timer.error && (
        <p role="alert" className="text-caption text-danger">
          {m.pomodoro_error()}
        </p>
      )}
    </section>
  );
}
