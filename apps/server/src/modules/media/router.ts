import type { MediaLive } from './live.ts';
import type { MediaArt } from './art.ts';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../../core/trpc.ts';
import { readMediaState } from './live.ts';
import type { Context } from '../../core/trpc.ts';

async function control(ctx: Context, action: 'play-pause' | 'next' | 'previous', media: MediaLive) {
  const { code } = await ctx.run('playerctl', [action]);
  if (code !== 0) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Media control failed' });
  void media.notify();
}

export function createMediaRouter(media: MediaLive, mediaArt: MediaArt) {
  return router({
    state: protectedProcedure.query(({ ctx }) => readMediaState(ctx.run)),

    onState: protectedProcedure.subscription(({ signal }) => media.subscribe(signal)),

    art: protectedProcedure.query(() => mediaArt()),

    playPause: protectedProcedure
      .meta({ description: 'Toggle play/pause on the current media player' })
      .mutation(({ ctx }) => control(ctx, 'play-pause', media)),
    next: protectedProcedure
      .meta({ description: 'Play the next track on the current media player' })
      .mutation(({ ctx }) => control(ctx, 'next', media)),
    previous: protectedProcedure
      .meta({ description: 'Play the previous track on the current media player' })
      .mutation(({ ctx }) => control(ctx, 'previous', media)),
  });
}
