import type { AirPlayConfig } from './config.ts';
import type { AirPlayLive } from './live.ts';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../../core/trpc.ts';
import { readAirPlayState } from './live.ts';

export function createAirPlayRouter(live: AirPlayLive, config: AirPlayConfig) {
  return router({
    state: protectedProcedure.query(({ ctx }) => readAirPlayState(ctx.run, config)),

    onState: protectedProcedure.subscription(({ signal }) => live.subscribe(signal)),

    start: protectedProcedure
      .meta({
        label: 'Avvia AirPlay',
        description: 'Start the AirPlay receiver service on the PC',
      })
      .mutation(async ({ ctx }) => {
        const { code } = await ctx.run(config.command, ['start']);
        if (code !== 0) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to start AirPlay' });
        void live.notify();
      }),

    stop: protectedProcedure
      .meta({
        label: 'Ferma AirPlay',
        description: 'Stop the AirPlay receiver service on the PC',
      })
      .mutation(async ({ ctx }) => {
        const { code } = await ctx.run(config.command, ['stop']);
        if (code !== 0) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to stop AirPlay' });
        void live.notify();
      }),
  });
}
