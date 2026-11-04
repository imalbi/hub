import { z } from 'zod';
import { pomodoroDurationsSchema } from '../../core/config.ts';
import { protectedProcedure, router } from '../../core/trpc.ts';

export const pomodoroRouter = router({
  state: protectedProcedure.query(({ ctx }) => ctx.live.pomodoro.state()),
  onState: protectedProcedure.subscription(({ ctx, signal }) => ctx.live.pomodoro.subscribe(signal)),
  start: protectedProcedure
    .meta({ description: 'Start a Pomodoro focus session from idle' })
    .mutation(({ ctx }) => ctx.live.pomodoro.act('start')),
  pause: protectedProcedure
    .meta({ description: 'Pause the current Pomodoro phase, preserving its remaining time' })
    .mutation(({ ctx }) => ctx.live.pomodoro.act('pause')),
  resume: protectedProcedure
    .meta({ description: 'Resume the paused Pomodoro phase' })
    .mutation(({ ctx }) => ctx.live.pomodoro.act('resume')),
  skip: protectedProcedure
    .meta({ description: 'Skip the current Pomodoro phase without marking it completed' })
    .mutation(({ ctx }) => ctx.live.pomodoro.act('skip')),
  stop: protectedProcedure
    .meta({ description: 'Stop Pomodoro and return to idle without completing the current phase' })
    .mutation(({ ctx }) => ctx.live.pomodoro.act('stop')),
  configure: protectedProcedure
    .meta({
      description:
        'Set the Pomodoro durations in minutes (longBreakEvery 0 means no long break) and whether a chime plays at the end of a phase; applies from the next phase',
    })
    .input(pomodoroDurationsSchema.extend({ sound: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.live.pomodoro.configure(input)),
});
