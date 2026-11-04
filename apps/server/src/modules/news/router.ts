import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../../core/trpc.ts';

// Fetching every feed takes a while on a slow one; the digest's own timeouts are per feed.
const refreshTimeoutMs = 60_000;

export const newsRouter = router({
  state: protectedProcedure.query(({ ctx }) => ctx.live.news.read()),
  onState: protectedProcedure.subscription(({ ctx, signal }) => ctx.live.news.subscribe(signal)),

  refresh: protectedProcedure
    .meta({
      description:
        "Fetch the owner's web development news feeds and regenerate the digest page, without opening it; marks the new items as seen",
    })
    .mutation(async ({ ctx }) => {
      const { command } = ctx.config.news;
      if (!command) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'News is not configured' });
      // --no-open: Hub never pops a browser window on the desktop by itself.
      const { code } = await ctx.run(command, ['--no-open'], { timeoutMs: refreshTimeoutMs });
      if (code === -1) throw new TRPCError({ code: 'TIMEOUT', message: 'The digest did not finish in time' });
      if (code !== 0) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'The digest failed' });
      void ctx.live.news.notify();
    }),
  open: protectedProcedure
    .meta({ description: 'Open the latest web development news digest in the browser on the PC' })
    .mutation(async ({ ctx }) => {
      const { page } = ctx.config.news;
      if (!page) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'News is not configured' });
      const { code } = await ctx.run('xdg-open', [page]);
      if (code !== 0) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not open the digest' });
    }),
});
