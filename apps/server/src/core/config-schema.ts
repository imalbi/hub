import { z } from 'zod';
export const coreConfigSchema = z.object({
  jobs: z
    .object({
      maxConcurrent: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(2)
        .meta({ title: 'Job simultanei', description: 'Numero massimo di job eseguiti contemporaneamente.' }),
    })
    .default({ maxConcurrent: 2 })
    .meta({ title: 'Job', description: 'Limiti dei job in esecuzione.' }),
  server: z
    .object({
      // Where to listen. Loopback until the deck is paired; `0.0.0.0` (or a LAN address) opens Hub to the home network.
      host: z.string().min(1).default('127.0.0.1').meta({
        title: 'Indirizzo di ascolto',
        description: 'Dove Hub accetta connessioni; 127.0.0.1 solo questo computer, 0.0.0.0 anche la rete di casa.',
      }),
      // Extra page origins allowed to open the WebSocket (the deck on the LAN); dev origins are built in.
      allowedOrigins: z.array(z.string().min(1)).default([]).meta({
        title: 'Origini consentite',
        description: 'Indirizzi di pagine extra che possono collegarsi, come il deck in rete locale.',
      }),
    })
    .default({ host: '127.0.0.1', allowedOrigins: [] }),
  files: z
    .object({
      maxUploadMb: z
        .number()
        .positive()
        .max(1024)
        .default(25)
        .meta({ title: 'Dimensione massima', description: 'Peso massimo di un file caricato.', unit: 'MB' }),
    })
    .optional(),
  modules: z.record(z.string(), z.unknown()).optional(),
  // Names of modules that are switched off: not created at startup, their data untouched. Kept at the top level because
  // module slices belong to their own (often strict) schemas.
  modulesOff: z
    .array(z.string())
    .default([])
    .meta({ title: 'Moduli spenti', description: 'Nomi dei moduli da non avviare; i loro dati restano intatti.' }),
});
export type CoreConfig = z.infer<typeof coreConfigSchema>;
