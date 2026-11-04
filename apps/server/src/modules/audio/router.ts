import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../../trpc.ts';
import { readAudioState, readSnapshot } from './live.ts';
import { nextOutput, resolveOutputs } from './pipewire.ts';

export const audioRouter = router({
  state: protectedProcedure.query(({ ctx }) => readAudioState(ctx.run, ctx.config)),

  onState: protectedProcedure.subscription(({ ctx, signal }) => ctx.live.audio.subscribe(signal)),

  cycleOutput: protectedProcedure
    .meta({ description: 'Switch the default audio output to the next configured device' })
    .mutation(async ({ ctx }) => {
      const { sinks, defaultName } = await readSnapshot(ctx.run);
      const next = nextOutput(resolveOutputs(sinks, ctx.config.audio.outputs), defaultName);
      if (!next)
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No configured audio output is available' });

      const { code, stderr } = await ctx.run('wpctl', ['set-default', String(next.sink.id)]);
      if (code !== 0)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `wpctl set-default failed: ${stderr.trim()}` });
      void ctx.live.audio.notify();
      return { label: next.label };
    }),
});
