import { fileURLToPath } from 'node:url';
import { z } from '../../apps/server/src/core/module.ts';
import { defineModule } from '../../apps/server/src/core/module.ts';
import { greetings } from './schema.ts';
import { createLiveHub } from '../../apps/server/src/core/live.ts';
import { protectedProcedure, router } from '../../apps/server/src/core/trpc.ts';

export default defineModule({
  name: 'hello',
  zones: ['hello'],
  // Declaring the folder gives the module its own SQLite file, `deps.db`, migrated before `create` runs.
  migrations: fileURLToPath(new URL('./drizzle', import.meta.url)),
  config: z
    .object({
      greeting: z
        .string()
        .min(1)
        .default('Ciao dal modulo di esempio')
        .meta({ title: 'Saluto', description: 'La frase che il modulo mostra.' }),
      repeatMinutes: z
        .number()
        .int()
        .min(1)
        .max(120)
        .default(15)
        .meta({ title: 'Intervallo', description: 'Ogni quanto ripete il saluto.', unit: 'minuti' }),
      place: z
        .number()
        .int()
        .min(1)
        .max(3)
        .default(1)
        .meta({
          title: 'Luogo',
          description: 'Dove lavori.',
          optionLabels: { 1: 'In sede', 2: 'Remoto', 3: 'Ibrido' },
        }),
      places: z
        .array(z.number().int().min(1).max(3))
        .default([])
        .meta({
          title: 'Luoghi accettati',
          description: 'Dove accetti di lavorare.',
          optionLabels: { 1: 'In sede', 2: 'Remoto', 3: 'Ibrido' },
        }),
      weights: z
        .record(z.string(), z.number())
        .default({})
        .meta({ title: 'Pesi', description: 'Un peso per ogni parola.' }),
      categories: z
        .record(z.string(), z.array(z.string()))
        .default({})
        .meta({ title: 'Categorie', description: 'Parole per categoria.' }),
      outputs: z
        .array(
          z.object({
            label: z.string().meta({ title: 'Nome' }),
            match: z.string().meta({ title: 'Corrispondenza' }),
          }),
        )
        .default([])
        .meta({ title: 'Uscite', description: 'Una riga per uscita.' }),
      groups: z
        .array(z.object({ name: z.string(), tags: z.array(z.object({ id: z.string() })) }))
        .default([])
        .meta({ title: 'Gruppi', description: 'Elenco annidato, resta JSON.' }),
      nickname: z
        .string()
        .optional()
        .meta({ title: 'Soprannome', description: 'Facoltativo, senza valore predefinito.' }),
    })
    .default({
      greeting: 'Ciao dal modulo di esempio',
      repeatMinutes: 15,
      place: 1,
      places: [],
      weights: {},
      categories: {},
      outputs: [],
      groups: [],
    }),
  create({ config, db }) {
    const state = async () => ({ greeting: config.greeting, count: await db.$count(greetings) });
    const live = createLiveHub(state, null);
    return {
      router: router({
        copyFile: protectedProcedure
          .meta({ label: 'Copia file di esempio', description: 'Return a copy of an uploaded example file' })
          .input(z.object({ fileId: z.string().uuid() }))
          .mutation(async ({ ctx, input }) => {
            const original = await ctx.files.get(input.fileId);
            return ctx.files.put(await ctx.files.read(input.fileId), { name: original.name, mime: original.mime });
          }),
        state: protectedProcedure.query(state),
        onState: protectedProcedure.subscription(({ signal }) => live.subscribe(signal)),
        greet: protectedProcedure
          .meta({ label: 'Saluta', description: 'Increment the example greeting counter' })
          .mutation(async () => {
            await db.insert(greetings).values({ greetedAt: new Date() });
            void live.notify();
          }),
      }),
    };
  },
});
