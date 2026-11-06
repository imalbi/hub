import type { configSchema } from './config.ts';
import type { AudioLive } from './live.ts';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router, type Context } from '../../core/trpc.ts';
import { readAudioState, readSnapshot, readVolume } from './live.ts';
import { clampVolume, nextOutput, resolveOutputs } from './pipewire.ts';

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
      .meta({
        label: 'Cambia uscita audio',
        description: 'Switch the default audio output to the next configured device',
      })
      .mutation(async ({ ctx }) => {
        const { sinks, defaultName } = await readSnapshot(ctx.run);
        const next = nextOutput(resolveOutputs(sinks, config.outputs), defaultName);
        if (!next)
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No configured audio output is available' });

        await setDefault(ctx, next.sink.id, audio);
        return { label: next.label };
      }),

    setOutput: protectedProcedure
      .meta({
        label: 'Seleziona uscita audio',
        description: 'Switch the default audio output to the configured device with this label',
      })
      // The label is one of the owner's configured outputs (`audio.state` lists them), never a raw sink id or name.
      .input(z.object({ label: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const { sinks } = await readSnapshot(ctx.run);
        const output = resolveOutputs(sinks, config.outputs).find((o) => o.label === input.label);
        if (!output) throw new TRPCError({ code: 'NOT_FOUND', message: 'No configured output with that label' });
        if (!output.sink) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'That output is not available' });
        await setDefault(ctx, output.sink.id, audio);
      }),

    setVolume: protectedProcedure
      .meta({
        label: 'Imposta volume',
        description: 'Set the default audio output volume to a value between 0 and 1',
      })
      .input(z.object({ value: z.number().min(0).max(1) }))
      .mutation(async ({ ctx, input }) => {
        const target = clampVolume(input.value);
        const { code, stderr } = await ctx.run('wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', String(target)]);
        if (code !== 0)
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `wpctl set-volume failed: ${stderr.trim()}` });
        void audio.notify();
      }),

    stepVolume: protectedProcedure
      .meta({
        label: 'Regola volume',
        description: 'Step the default audio output volume up or down by 5%',
      })
      .input(z.object({ direction: z.enum(['up', 'down']) }))
      .mutation(async ({ ctx, input }) => {
        // No fallback value: stepping from a guessed level could jump the real volume to near full.
        const current = await readVolume(ctx.run, '@DEFAULT_AUDIO_SINK@');
        if (!current) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not read the volume' });
        const delta = input.direction === 'up' ? 0.05 : -0.05;
        const target = clampVolume(current.volume + delta);
        const { code, stderr } = await ctx.run('wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', String(target)]);
        if (code !== 0)
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `wpctl set-volume failed: ${stderr.trim()}` });
        void audio.notify();
      }),

    toggleMute: protectedProcedure
      .meta({
        label: 'Silenzia uscita audio',
        description: 'Toggle mute on the default audio output',
      })
      .mutation(async ({ ctx }) => {
        const { code, stderr } = await ctx.run('wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', 'toggle']);
        if (code !== 0)
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `wpctl set-mute failed: ${stderr.trim()}` });
        void audio.notify();
      }),

    toggleMicMute: protectedProcedure
      .meta({
        label: 'Silenzia microfono',
        description: 'Toggle mute on the default microphone',
      })
      .mutation(async ({ ctx }) => {
        const { code, stderr } = await ctx.run('wpctl', ['set-mute', '@DEFAULT_AUDIO_SOURCE@', 'toggle']);
        if (code !== 0)
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `wpctl set-mute failed: ${stderr.trim()}` });
        void audio.notify();
      }),
  });
}
