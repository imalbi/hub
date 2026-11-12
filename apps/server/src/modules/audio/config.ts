import { z } from 'zod';
export const configSchema = z
  .object({
    outputs: z
      .array(
        z.object({
          label: z.string().min(1).meta({ title: 'Nome', description: "Come appare l'uscita nell'elenco." }),
          // Case-insensitive substring of the PipeWire node.description; device names are personal, so they live in config.
          match: z.string().min(1).meta({
            title: 'Testo da cercare',
            description: 'Parte del nome della periferica audio, senza distinzione tra maiuscole e minuscole.',
          }),
        }),
      )
      .meta({
        title: 'Uscite audio',
        description: 'Le periferiche tra cui scegliere; senza voci non compare nessuna uscita.',
      }),
  })
  .default({ outputs: [] });
