import { z } from 'zod';

export const configSchema = z
  .object({
    command: z.string().min(1).optional().meta({
      title: 'Comando',
      description: 'Programma che gestisce la ricezione AirPlay; se vuoto AirPlay resta spento.',
    }),
  })
  .default({});
