import { TRPCError } from '@trpc/server';
import type { Run } from '../../exec.ts';
import { publicProcedure, router } from '../../trpc.ts';
import { currentOutput, nextOutput, parsePwDump, resolveOutputs } from './pipewire.ts';

async function readSnapshot(run: Run) {
  const { stdout, code } = await run('pw-dump', []);
  return parsePwDump(code === 0 ? stdout : '');
}

export const audioRouter = router({
  state: publicProcedure.query(async ({ ctx }) => {
    const { sinks, defaultName } = await readSnapshot(ctx.run);
    const resolved = resolveOutputs(sinks, ctx.config.audio.outputs);
    const current = currentOutput(resolved, defaultName);
    return {
      current: current && { label: current.label },
      outputs: resolved.map((o) => ({ label: o.label, available: o.sink !== null })),
    };
  }),

  cycleOutput: publicProcedure
    .meta({ description: 'Switch the default audio output to the next configured device' })
    .mutation(async ({ ctx }) => {
      const { sinks, defaultName } = await readSnapshot(ctx.run);
      const next = nextOutput(resolveOutputs(sinks, ctx.config.audio.outputs), defaultName);
      if (!next)
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No configured audio output is available' });

      const { code, stderr } = await ctx.run('wpctl', ['set-default', String(next.sink.id)]);
      if (code !== 0)
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `wpctl set-default failed: ${stderr.trim()}` });
      return { label: next.label };
    }),
});
