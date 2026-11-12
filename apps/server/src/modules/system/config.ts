import { z } from 'zod';
export const configSchema = z
  .object({
    // Where the owner's powerstat tracker writes status.json and samples.csv. Unset hides consumption.
    powerstatDir: z.string().min(1).optional().meta({
      title: 'Cartella consumi',
      description: 'Cartella dove powerstat scrive i dati; se vuoto i consumi restano nascosti.',
    }),
  })
  .default({});
