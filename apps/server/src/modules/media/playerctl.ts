import { z } from 'zod';
import type { RunResult } from '../../exec.ts';

/** playerctl does not expand `\t` in --format, so the separators are real tabs. */
export const MEDIA_FORMAT = '{{status}}\t{{artist}}\t{{title}}';

const statusSchema = z.enum(['Playing', 'Paused', 'Stopped']);

/** `null` when no player is running: playerctl exits non-zero with "No players found", which is a normal state. */
export function parseMediaState({ stdout, code }: RunResult) {
  if (code !== 0) return null;
  const [rawStatus, artist = '', ...title] = stdout.replace(/\n$/, '').split('\t');
  const status = statusSchema.safeParse(rawStatus);
  if (!status.success) return null;
  return { status: status.data, artist, title: title.join('\t') };
}
