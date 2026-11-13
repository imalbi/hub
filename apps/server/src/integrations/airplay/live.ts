import type { AirPlayConfig } from './config.ts';
import type { Run } from '../../core/exec.ts';
import { createLiveHub } from '../../core/live.ts';

export type AirPlayState = { running: boolean };

export async function readAirPlayState(run: Run, { command }: AirPlayConfig): Promise<AirPlayState> {
  const { code } = await run(command, ['status']);
  return { running: code === 0 };
}

export const createAirPlayLive = (run: Run, config: AirPlayConfig, intervalMs = 2000) =>
  createLiveHub(() => readAirPlayState(run, config), intervalMs);

export type AirPlayLive = ReturnType<typeof createAirPlayLive>;
