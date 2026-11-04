import type { Run } from '../../core/exec.ts';
import { createLiveHub } from '../../core/live.ts';
import { MEDIA_FORMAT, parseMediaState } from './playerctl.ts';

export const readMediaState = async (run: Run) =>
  parseMediaState(await run('playerctl', ['metadata', '--format', MEDIA_FORMAT]));

export const createMediaLive = (run: Run) => createLiveHub(() => readMediaState(run));
export type MediaLive = ReturnType<typeof createMediaLive>;
