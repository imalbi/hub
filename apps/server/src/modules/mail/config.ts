import { z } from 'zod';

// `account` is the himalaya account name (the table in its own config file, which Hub never reads); `label` is what the
// UI shows. Absent means off: no procedure answers and nothing polls.
export const configSchema = z
  .object({
    accounts: z
      .array(
        z.object({
          label: z
            .string()
            .trim()
            .min(1)
            .max(40)
            .meta({ title: 'Nome', description: "Come appare l'account nell'interfaccia." }),
          account: z
            .string()
            .min(1)
            .max(60)
            .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/)
            .meta({ title: 'Account himalaya', description: "Nome dell'account nella configurazione di himalaya." }),
        }),
      )
      .min(1)
      .max(10)
      .meta({
        title: 'Account di posta',
        description: 'Gli account da leggere; senza questa sezione la posta resta spenta.',
      }),
  })
  .optional();

export type MailAccount = { label: string; account: string };
