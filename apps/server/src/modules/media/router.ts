import type { MediaLive } from './live.ts';
import type { MediaArt } from './art.ts';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../../core/trpc.ts';
import { playerArgs } from './preference.ts';
import { readMediaState } from './live.ts';
import type { Context } from '../../core/trpc.ts';

async function control(ctx: Context, action: 'play-pause' | 'next' | 'previous', media: MediaLive) {
  const { code } = await ctx.run('playerctl', [...(await playerArgs(ctx.run)), action]);
  if (code !== 0) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Media control failed' });
  void media.notify();
}

export function createMediaRouter(media: MediaLive, mediaArt: MediaArt) {
  return router({
    state: protectedProcedure.query(({ ctx }) => readMediaState(ctx.run)),

    onState: protectedProcedure.subscription(({ signal }) => media.subscribe(signal)),

    art: protectedProcedure.query(() => mediaArt()),

    seek: protectedProcedure
      .meta({ label: 'Posizione del brano', description: 'Seek to a position in the current track' })
      .input(z.object({ seconds: z.number().finite().min(0).max(86400) }))
      .mutation(async ({ ctx, input }) => {
        const { code } = await ctx.run('playerctl', [
          ...(await playerArgs(ctx.run)),
          'position',
          String(input.seconds),
        ]);
        if (code !== 0) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Media control failed' });
        void media.notify();
      }),

    playPause: protectedProcedure
      .meta({ label: 'Riproduci o metti in pausa', description: 'Toggle play/pause on the current media player' })
      .mutation(({ ctx }) => control(ctx, 'play-pause', media)),
    next: protectedProcedure
      .meta({ label: 'Traccia successiva', description: 'Play the next track on the current media player' })
      .mutation(({ ctx }) => control(ctx, 'next', media)),
    previous: protectedProcedure
      .meta({ label: 'Traccia precedente', description: 'Play the previous track on the current media player' })
      .mutation(({ ctx }) => control(ctx, 'previous', media)),
  });
}
