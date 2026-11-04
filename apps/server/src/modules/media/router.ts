import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from '../../trpc.ts';
import { MEDIA_FORMAT, parseMediaState } from './playerctl.ts';

export const mediaRouter = router({
  state: publicProcedure.query(async ({ ctx }) =>
    parseMediaState(await ctx.run('playerctl', ['metadata', '--format', MEDIA_FORMAT])),
  ),

  playPause: publicProcedure
    .meta({ description: 'Toggle play/pause on the current media player' })
    .mutation(async ({ ctx }) => {
      const { code, stderr } = await ctx.run('playerctl', ['play-pause']);
      if (code !== 0)
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `playerctl play-pause failed: ${stderr.trim()}` });
    }),
});
