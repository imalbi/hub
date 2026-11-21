import { z } from 'zod';
export const configSchema = z
  .object({
    page: z.string().min(1).optional().meta({
      manual: true,
      title: 'Pagina',
      description: 'Pagina con il riepilogo delle notizie da aprire; se vuoto non si può aprire.',
    }),
    stateFile: z.string().min(1).optional().meta({
      manual: true,
      title: 'File di stato',
      description:
        "File aggiornato a ogni scarico, da cui si legge la data dell'ultimo aggiornamento; se vuoto non compare.",
    }),
    command: z.string().min(1).optional().meta({
      manual: true,
      title: 'Comando',
      description: 'Programma che scarica le notizie e rigenera la pagina; se vuoto non si può aggiornare.',
    }),
  })
  .default({});
