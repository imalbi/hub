import { z } from 'zod';

/** `modules.airplay` in the owner's config. `command` is required: without it the module fails to load, so nothing of AirPlay (routes, palette actions, tiles, rows) exists. */
export const airplayConfigSchema = z.object({
  command: z.string().min(1).meta({
    manual: true,
    title: 'Comando',
    description: 'Programma che gestisce la ricezione AirPlay (status, start, stop).',
  }),
});
export type AirPlayConfig = z.output<typeof airplayConfigSchema>;
