import { z } from '../../apps/server/src/core/module.ts';
import { defineModule } from '../../apps/server/src/core/module.ts';
import { createLiveHub } from '../../apps/server/src/core/live.ts';
import { protectedProcedure, router } from '../../apps/server/src/core/trpc.ts';

export default defineModule({
  name: 'hello',
  zones: ['hello'],
  config: z
    .object({ greeting: z.string().min(1).default('Ciao dal modulo di esempio') })
    .default({ greeting: 'Ciao dal modulo di esempio' }),
  create({ config }) {
    let count = 0;
    const state = () => Promise.resolve({ greeting: config.greeting, count });
    const live = createLiveHub(state, null);
    return {
      router: router({
        copyFile: protectedProcedure
          .meta({ description: 'Return a copy of an uploaded example file' })
          .input(z.object({ fileId: z.string().uuid() }))
          .mutation(async ({ ctx, input }) => {
            const original = await ctx.files.get(input.fileId);
            return ctx.files.put(await ctx.files.read(input.fileId), { name: original.name, mime: original.mime });
          }),
        state: protectedProcedure.query(state),
        onState: protectedProcedure.subscription(({ signal }) => live.subscribe(signal)),
        greet: protectedProcedure.meta({ description: 'Increment the example greeting counter' }).mutation(() => {
          count++;
          void live.notify();
        }),
      }),
    };
  },
});
