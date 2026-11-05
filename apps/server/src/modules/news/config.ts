import { z } from 'zod';
export const configSchema = z
  .object({
    page: z.string().min(1).optional(),
    stateFile: z.string().min(1).optional(),
    command: z.string().min(1).optional(),
  })
  .default({});
