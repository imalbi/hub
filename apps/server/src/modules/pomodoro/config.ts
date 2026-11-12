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
    focusMinutes: durations.focusMinutes
      .default(25)
      .meta({ title: 'Durata del focus', description: 'Quanto dura una sessione di lavoro.', unit: 'minuti' }),
    shortBreakMinutes: durations.shortBreakMinutes
      .default(5)
      .meta({ title: 'Pausa breve', description: 'Quanto dura la pausa tra due sessioni.', unit: 'minuti' }),
    longBreakMinutes: durations.longBreakMinutes
      .default(15)
      .meta({ title: 'Pausa lunga', description: 'Quanto dura la pausa dopo un ciclo di sessioni.', unit: 'minuti' }),
    longBreakEvery: durations.longBreakEvery.default(4).meta({
      title: 'Pausa lunga ogni',
      description: 'Dopo quante sessioni arriva la pausa lunga; 0 la disattiva.',
      unit: 'sessioni',
    }),
  })
  .default({ focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 });
