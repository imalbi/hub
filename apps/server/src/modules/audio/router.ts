import type { configSchema } from './config.ts';
import type { AudioLive } from './live.ts';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router, type Context } from '../../core/trpc.ts';
import { readAudioState, readSnapshot } from './live.ts';
import { nextOutput, resolveOutputs } from './pipewire.ts';

async function setDefault(ctx: Context, id: number, audio: AudioLive) {
  const { code, stderr } = await ctx.run('wpctl', ['set-default', String(id)]);
  if (code !== 0)
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `wpctl set-default failed: ${stderr.trim()}` });
  void audio.notify();
}

export function createAudioRouter(audio: AudioLive, config: z.output<typeof configSchema>) {
  return router({
    state: protectedProcedure.query(({ ctx }) => readAudioState(ctx.run, { audio: config })),

    onState: protectedProcedure.subscription(({ signal }) => audio.subscribe(signal)),

    cycleOutput: protectedProcedure
      .meta({ description: 'Switch the default audio output to the next configured device' })
      .mutation(async ({ ctx }) => {
        const { sinks, defaultName } = await readSnapshot(ctx.run);
        const next = nextOutput(resolveOutputs(sinks, config.outputs), defaultName);
        if (!next)
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No configured audio output is available' });

        await setDefault(ctx, next.sink.id, audio);
        return { label: next.label };
      }),

    setOutput: protectedProcedure
      .meta({ description: 'Switch the default audio output to the configured device with this label' })
      // The label is one of the owner's configured outputs (`audio.state` lists them), never a raw sink id or name.
      .input(z.object({ label: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const { sinks } = await readSnapshot(ctx.run);
        const output = resolveOutputs(sinks, config.outputs).find((o) => o.label === input.label);
        if (!output) throw new TRPCError({ code: 'NOT_FOUND', message: 'No configured output with that label' });
        if (!output.sink) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'That output is not available' });
        await setDefault(ctx, output.sink.id, audio);
      }),
  });
}
