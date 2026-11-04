import { audioRouter } from './modules/audio/router.ts';
import { devicesRouter } from './modules/devices/router.ts';
import { mediaRouter } from './modules/media/router.ts';
import { pairingRouter } from './modules/devices/pairing-router.ts';
import { pomodoroRouter } from './modules/pomodoro/router.ts';
import { protectedProcedure, router } from './core/trpc.ts';

export const appRouter = router({
  health: protectedProcedure.query(() => ({ ok: true, uptime: Math.round(process.uptime()) })),
  audio: audioRouter,
  media: mediaRouter,
  pairing: pairingRouter,
  devices: devicesRouter,
  pomodoro: pomodoroRouter,
});

export type AppRouter = typeof appRouter;
