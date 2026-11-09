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
  // Names of modules that are switched off: not created at startup, their data untouched. Kept at the top level because
  // module slices belong to their own (often strict) schemas.
  modulesOff: z.array(z.string()).default([]),
});
export type CoreConfig = z.infer<typeof coreConfigSchema>;
