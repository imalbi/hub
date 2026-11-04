import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from '../../trpc.ts';
import { readMediaState } from './live.ts';

export const mediaRouter = router({
  state: publicProcedure.query(({ ctx }) => readMediaState(ctx.run)),

  onState: publicProcedure.subscription(({ ctx, signal }) => ctx.live.media.subscribe(signal)),

  playPause: publicProcedure
    .meta({ description: 'Toggle play/pause on the current media player' })
    .mutation(async ({ ctx }) => {
      const { code, stderr } = await ctx.run('playerctl', ['play-pause']);
      if (code !== 0)
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `playerctl play-pause failed: ${stderr.trim()}` });
      void ctx.live.media.notify();
    }),
});
