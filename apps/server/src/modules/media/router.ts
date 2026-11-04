import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../../core/trpc.ts';
import { readMediaState } from './live.ts';
import type { Context } from '../../core/trpc.ts';

async function control(ctx: Context, action: 'play-pause' | 'next' | 'previous') {
  const { code } = await ctx.run('playerctl', [action]);
  if (code !== 0) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Media control failed' });
  void ctx.live.media.notify();
}

export const mediaRouter = router({
  state: protectedProcedure.query(({ ctx }) => readMediaState(ctx.run)),

  onState: protectedProcedure.subscription(({ ctx, signal }) => ctx.live.media.subscribe(signal)),

  art: protectedProcedure.query(({ ctx }) => ctx.mediaArt()),

  playPause: protectedProcedure
    .meta({ description: 'Toggle play/pause on the current media player' })
    .mutation(({ ctx }) => control(ctx, 'play-pause')),
  next: protectedProcedure
    .meta({ description: 'Play the next track on the current media player' })
    .mutation(({ ctx }) => control(ctx, 'next')),
  previous: protectedProcedure
    .meta({ description: 'Play the previous track on the current media player' })
    .mutation(({ ctx }) => control(ctx, 'previous')),
});
