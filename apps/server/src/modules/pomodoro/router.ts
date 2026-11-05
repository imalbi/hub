import type { PomodoroLive } from './live.ts';
import { z } from 'zod';
import { pomodoroDurationsSchema } from './config.ts';
import { protectedProcedure, router } from '../../core/trpc.ts';

export function createPomodoroRouter(pomodoro: PomodoroLive) {
  return router({
    state: protectedProcedure.query(() => pomodoro.state()),
    onState: protectedProcedure.subscription(({ signal }) => pomodoro.subscribe(signal)),
    start: protectedProcedure
      .meta({ label: 'Avvia Pomodoro', description: 'Start a Pomodoro focus session from idle' })
      .mutation(() => pomodoro.act('start')),
    pause: protectedProcedure
      .meta({
        label: 'Metti in pausa Pomodoro',
        description: 'Pause the current Pomodoro phase, preserving its remaining time',
      })
      .mutation(() => pomodoro.act('pause')),
    resume: protectedProcedure
      .meta({ label: 'Riprendi Pomodoro', description: 'Resume the paused Pomodoro phase' })
      .mutation(() => pomodoro.act('resume')),
    skip: protectedProcedure
      .meta({
        label: 'Salta fase Pomodoro',
        description: 'Skip the current Pomodoro phase without marking it completed',
      })
      .mutation(() => pomodoro.act('skip')),
    stop: protectedProcedure
      .meta({
        label: 'Ferma Pomodoro',
        description: 'Stop Pomodoro and return to idle without completing the current phase',
      })
      .mutation(() => pomodoro.act('stop')),
    configure: protectedProcedure
      .meta({
        label: 'Configura Pomodoro',
        description:
          'Set the Pomodoro durations in minutes (longBreakEvery 0 means no long break) and whether a chime plays at the end of a phase; applies from the next phase',
      })
      .input(pomodoroDurationsSchema.extend({ sound: z.boolean() }))
      .mutation(({ input }) => pomodoro.configure(input)),
  });
}
