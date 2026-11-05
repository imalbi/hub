import { z } from 'zod';
export const configSchema = z
  .object({
    outputs: z.array(
      z.object({
        label: z.string().min(1),
        // Case-insensitive substring of the PipeWire node.description; device names are personal, so they live in config.
        match: z.string().min(1),
      }),
    ),
  })
  .default({ outputs: [] });
