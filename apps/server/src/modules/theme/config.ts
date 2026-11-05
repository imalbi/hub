import { z } from 'zod';
export const configSchema = z
  .object({
    // Caelestia's color scheme file. Unset means the Caelestia theme is off; `src/index.ts` fills in the usual path.
    caelestiaScheme: z.string().min(1).optional(),
  })
  .default({});
