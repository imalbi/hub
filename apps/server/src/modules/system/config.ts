import { z } from 'zod';
export const configSchema = z
  .object({
    // Where the owner's powerstat tracker writes status.json and samples.csv. Unset hides consumption.
    powerstatDir: z.string().min(1).optional(),
  })
  .default({});
