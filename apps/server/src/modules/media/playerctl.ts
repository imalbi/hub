import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { RunResult } from '../../core/exec.ts';

/** playerctl does not expand `\t` in --format, so the separators are real tabs. */
export const MEDIA_FORMAT = '{{status}}\t{{artist}}\t{{title}}\t{{mpris:artUrl}}\t{{mpris:length}}';

const statusSchema = z.enum(['Playing', 'Paused', 'Stopped']);

/** `null` when no player is running: playerctl exits non-zero with "No players found", which is a normal state. */
export function parseMediaMetadata({ stdout, code }: RunResult) {
  if (code !== 0) return null;
  const [rawStatus, artist = '', ...fields] = stdout.replace(/\n$/, '').split('\t');
  const status = statusSchema.safeParse(rawStatus);
  if (!status.success) return null;
  const extended = fields.length >= 3;
  const artUrl = extended ? fields.at(-2)?.trim() || null : null;
  const rawLength = extended ? fields.at(-1) : undefined;
  const micros = rawLength?.trim() ? Number(rawLength) : NaN;
  return {
    artUrl,
    state: {
      status: status.data,
      artist,
      title: (extended ? fields.slice(0, -2) : fields).join('\t'),
      lengthMs: Number.isFinite(micros) && micros >= 0 ? Math.floor(micros / 1000) : null,
      artKey: artUrl ? createHash('sha256').update(artUrl).digest('hex').slice(0, 16) : null,
    },
  };
}

export function parseMediaState(result: RunResult) {
  return parseMediaMetadata(result)?.state ?? null;
}
