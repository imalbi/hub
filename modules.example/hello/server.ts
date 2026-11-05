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
    .object({ greeting: z.string().min(1).default('Ciao dal modulo di esempio') })
    .default({ greeting: 'Ciao dal modulo di esempio' }),
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
