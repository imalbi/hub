import { z } from 'zod';

export const configSchema = z
  .object({
    command: z.string().min(1).optional(),
  })
  .default({});
