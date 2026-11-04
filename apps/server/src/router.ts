import { audioRouter } from './modules/audio/router.ts';
import { mediaRouter } from './modules/media/router.ts';
import { publicProcedure, router } from './trpc.ts';

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, uptime: Math.round(process.uptime()) })),
  audio: audioRouter,
  media: mediaRouter,
});

export type AppRouter = typeof appRouter;
