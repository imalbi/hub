import type { z } from 'zod';
import type { configSchema } from './config.ts';
import type { Run } from '../../core/exec.ts';
import { createLiveHub } from '../../core/live.ts';

export type AirPlayState = { running: boolean };

export async function readAirPlayState(run: Run, config: z.output<typeof configSchema>): Promise<AirPlayState | null> {
  const { command } = config;
  if (!command) return null;
  const { code } = await run(command, ['status']);
  return { running: code === 0 };
}

export const createAirPlayLive = (run: Run, config: z.output<typeof configSchema>, intervalMs = 2000) =>
  createLiveHub(() => readAirPlayState(run, config), intervalMs);

export type AirPlayLive = ReturnType<typeof createAirPlayLive>;
