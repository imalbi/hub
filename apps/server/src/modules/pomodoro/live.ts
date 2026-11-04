import { TRPCError } from '@trpc/server';
import { and, count, eq, gte, lt } from 'drizzle-orm';
import type { Config } from '../../config.ts';
import type { Db } from '../../db/index.ts';
import { pomodoroSessions } from '../../db/schema.ts';
import type { Run } from '../../exec.ts';
import { createLiveHub } from '../../live.ts';
import { createTimer, localMidnight, nextMidnight, timerState, transition, type TimerAction } from './timer.ts';

export function createPomodoro(
  db: Db,
  run: Run,
  config: Config['pomodoro'],
  onError: (error: unknown) => void = () => {},
) {
  const now = Date.now();
  const completed =
    db
      .select({ value: count() })
      .from(pomodoroSessions)
      .where(
        and(
          eq(pomodoroSessions.kind, 'focus'),
          eq(pomodoroSessions.completed, true),
          gte(pomodoroSessions.endedAt, new Date(localMidnight(now))),
          lt(pomodoroSessions.endedAt, new Date(nextMidnight(now))),
        ),
      )
      .get()?.value ?? 0;
  const total =
    db
      .select({ value: count() })
      .from(pomodoroSessions)
      .where(and(eq(pomodoroSessions.kind, 'focus'), eq(pomodoroSessions.completed, true)))
      .get()?.value ?? 0;
  let timer = createTimer(now, completed, total);
  let deadline: NodeJS.Timeout | undefined;
  let closed = false;
  const hub = createLiveHub(() => Promise.resolve(state()), null);

  function schedule() {
    clearTimeout(deadline);
    if (closed) return;
    const at = Date.now();
    const end = Math.min(timer.endsAt ?? Infinity, nextMidnight(at));
    deadline = setTimeout(
      () => {
        try {
          settle();
          void hub.notify();
          schedule();
        } catch (error) {
          onError(error);
        }
      },
      Math.max(1, end - at),
    );
    deadline.unref();
  }

  function apply(action: TimerAction) {
    const result = transition(timer, action, config, Date.now());
    if (!result) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Invalid Pomodoro transition' });
    if (result.ended) {
      db.insert(pomodoroSessions)
        .values({
          kind: result.ended.kind,
          startedAt: new Date(result.ended.startedAt),
          endedAt: new Date(result.ended.endedAt),
          completed: result.ended.completed,
        })
        .run();
    }
    timer = result.timer;
    schedule();
    void hub.notify();
    if (result.ended?.completed) {
      const focus = result.ended.kind === 'focus';
      void run('notify-send', [
        '--app-name',
        'Hub',
        focus ? 'Concentrazione completata' : 'Pausa terminata',
        focus ? 'È il momento di una pausa.' : 'Puoi iniziare una nuova sessione.',
      ]);
    }
  }

  function settle() {
    if (timer.endsAt !== null && timer.endsAt <= Date.now()) apply('complete');
  }

  function state() {
    settle();
    return timerState(timer, Date.now());
  }

  function act(action: Exclude<TimerAction, 'complete'>) {
    settle();
    apply(action);
  }

  function close() {
    closed = true;
    clearTimeout(deadline);
  }

  schedule();
  return { state, act, subscribe: hub.subscribe, close };
}

export type PomodoroLive = ReturnType<typeof createPomodoro>;
