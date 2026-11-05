import { z } from 'zod';
export const coreConfigSchema = z.object({
  server: z
    .object({
      // Where to listen. Loopback until the deck is paired; `0.0.0.0` (or a LAN address) opens Hub to the home network.
      host: z.string().min(1).default('127.0.0.1'),
      // Extra page origins allowed to open the WebSocket (the deck on the LAN); dev origins are built in.
      allowedOrigins: z.array(z.string().min(1)).default([]),
    })
    .default({ host: '127.0.0.1', allowedOrigins: [] }),
  files: z.object({ maxUploadMb: z.number().positive().max(1024).default(25) }).optional(),
  modules: z.record(z.string(), z.unknown()).optional(),
});
export type CoreConfig = z.infer<typeof coreConfigSchema>;
