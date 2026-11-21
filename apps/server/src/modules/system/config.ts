import { z } from 'zod';

const monitorSchema = z.object({
  output: z.string().min(1).meta({
    title: 'Uscita',
    description: 'Nome dell’uscita in Hyprland, come lo mostra hyprctl monitors.',
  }),
  label: z.string().min(1).meta({ title: 'Nome', description: 'Come si chiama nella pagina e sul deck.' }),
  command: z.string().min(1).meta({
    manual: true,
    title: 'Comando',
    description: 'Programma che accende o spegne questo monitor, senza argomenti.',
  }),
});
export type MonitorConfig = z.output<typeof monitorSchema>;

export const configSchema = z
  .object({
    // Where the owner's powerstat tracker writes status.json and samples.csv. Unset hides consumption.
    powerstatDir: z.string().min(1).optional().meta({
      manual: true,
      title: 'Cartella consumi',
      description: 'Cartella dove powerstat scrive i dati; se vuoto i consumi restano nascosti.',
    }),
    // The command owns the geometry, so Hub never builds a `hyprctl eval` string (see plan 34, decision 1).
    monitors: z.array(monitorSchema).default([]).meta({
      title: 'Monitor',
      description: 'Monitor che Hub accende e spegne; se vuoto non compare nulla.',
    }),
  })
  .default({ monitors: [] });
