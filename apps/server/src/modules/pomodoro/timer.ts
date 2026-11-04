import type { Config } from '../../core/config.ts';

export type TimerAction = 'start' | 'pause' | 'resume' | 'skip' | 'stop' | 'complete';
type Active = {
  phase: 'focus' | 'break';
  startedAt: number;
  endsAt: number | null;
  pausedRemainingMs: number | null;
  durationMs: number;
};
type Idle = { phase: 'idle'; startedAt: null; endsAt: null; pausedRemainingMs: null; durationMs: 0 };
export type Timer = (Active | Idle) & {
  completedFocusToday: number;
  completedFocusCount: number;
  dayStartedAt: number;
};
export type EndedPhase = { kind: 'focus' | 'break'; startedAt: number; endedAt: number; completed: boolean };

export function localMidnight(now: number): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

export function nextMidnight(now: number): number {
  const day = new Date(localMidnight(now));
  day.setDate(day.getDate() + 1);
  return day.getTime();
}

export function createTimer(now: number, completedFocusToday = 0, completedFocusCount = completedFocusToday): Timer {
  return {
    phase: 'idle',
    startedAt: null,
    endsAt: null,
    pausedRemainingMs: null,
    durationMs: 0,
    completedFocusToday,
    completedFocusCount,
    dayStartedAt: localMidnight(now),
  };
}

export function timerState(timer: Timer, now: number) {
  return {
    phase: timer.phase,
    startedAt: timer.startedAt,
    endsAt: timer.endsAt,
    pausedRemainingMs: timer.pausedRemainingMs,
    durationMs: timer.durationMs,
    completedFocusToday: timer.dayStartedAt === localMidnight(now) ? timer.completedFocusToday : 0,
  };
}

export function transition(
  timer: Timer,
  action: TimerAction,
  config: Config['pomodoro'],
  now: number,
): { timer: Timer; ended: EndedPhase | null } | null {
  const today = timerState(timer, now).completedFocusToday;
  const current = { ...timer, completedFocusToday: today, dayStartedAt: localMidnight(now) };
  function active(phase: 'focus' | 'break', minutes: number): Timer {
    const durationMs = minutes * 60_000;
    return { ...current, phase, startedAt: now, endsAt: now + durationMs, durationMs, pausedRemainingMs: null };
  }
  if (action === 'start')
    return current.phase === 'idle' ? { timer: active('focus', config.focusMinutes), ended: null } : null;
  if (current.phase === 'idle') return null;
  if (action === 'pause') {
    return current.endsAt !== null && current.endsAt > now
      ? { timer: { ...current, endsAt: null, pausedRemainingMs: current.endsAt - now }, ended: null }
      : null;
  }
  if (action === 'resume') {
    return current.pausedRemainingMs !== null
      ? { timer: { ...current, endsAt: now + current.pausedRemainingMs, pausedRemainingMs: null }, ended: null }
      : null;
  }
  const completed = action === 'complete';
  if (completed && (current.endsAt === null || current.endsAt > now)) return null;
  const ended: EndedPhase = { kind: current.phase, startedAt: current.startedAt, endedAt: now, completed };
  if (completed && current.phase === 'focus') {
    current.completedFocusToday++;
    current.completedFocusCount++;
  }
  const next =
    action !== 'stop' && current.phase === 'focus'
      ? active(
          'break',
          completed && current.completedFocusCount % config.longBreakEvery === 0
            ? config.longBreakMinutes
            : config.shortBreakMinutes,
        )
      : createTimer(now, current.completedFocusToday, current.completedFocusCount);
  return { timer: next, ended };
}
