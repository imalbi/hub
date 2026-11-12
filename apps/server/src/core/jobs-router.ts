import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from './trpc.ts';
import type { createJobRunner } from './jobs.ts';

export function createJobsRouter(jobs: ReturnType<typeof createJobRunner>) {
  return router({
    list: protectedProcedure.query(() => jobs.list()),
    onUpdate: protectedProcedure.subscription(({ signal }) => jobs.updates(signal)),
    output: protectedProcedure
      .meta({ label: 'Leggi output job', description: 'Read the latest output lines of a job' })
      .input(z.object({ jobId: z.string().uuid(), limit: z.number().int().min(1).max(500).optional() }))
      .query(({ input }) => jobs.output(input.jobId, input.limit)),
    onOutput: protectedProcedure
      .input(z.object({ jobId: z.string().uuid() }))
      .subscription(({ input, signal }) => jobs.lines(input.jobId, signal)),
    cancel: protectedProcedure
      .meta({ label: 'Annulla job', description: 'Cancel a running or queued job.', danger: true })
      .input(z.object({ jobId: z.string(), confirmed: z.literal(true) }))
      .mutation(({ input }) => {
        if (!jobs.cancel(input.jobId)) throw new TRPCError({ code: 'NOT_FOUND' });
        return { cancelled: true };
      }),
  });
}
