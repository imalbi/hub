import { z } from 'zod';
/** Pomodoro durations, from the config and overridden by the settings the owner saves from the UI (`pomodoro.configure`). */
export const pomodoroDurationsSchema = z.object({
  focusMinutes: z.number().positive().max(1440),
  shortBreakMinutes: z.number().positive().max(1440),
  longBreakMinutes: z.number().positive().max(1440),
  // 0 means never a long break.
  longBreakEvery: z.number().int().min(0).max(100),
});

const durations = pomodoroDurationsSchema.shape;

export const configSchema = z
  .object({
    focusMinutes: durations.focusMinutes.default(25),
    shortBreakMinutes: durations.shortBreakMinutes.default(5),
    longBreakMinutes: durations.longBreakMinutes.default(15),
    longBreakEvery: durations.longBreakEvery.default(4),
  })
  .default({ focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 });
