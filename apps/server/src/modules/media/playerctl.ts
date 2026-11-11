import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { RunResult } from '../../core/exec.ts';

/** playerctl does not expand `\t` in --format, so the separators are real tabs. */
export const MEDIA_FORMAT = '{{status}}\t{{artist}}\t{{title}}\t{{mpris:artUrl}}\t{{mpris:length}}';

const statusSchema = z.enum(['Playing', 'Paused', 'Stopped']);

export function parsePosition({ stdout, code }: RunResult) {
  const seconds = stdout.trim() ? Number(stdout) : NaN;
  return code === 0 && Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds * 1000) : null;
}

export function youtubeArtwork(source: string) {
  try {
    const url = new URL(source);
    const id = url.searchParams.get('v');
    return url.protocol === 'https:' &&
      url.hostname === 'music.youtube.com' &&
      url.pathname === '/watch' &&
      id &&
      /^[A-Za-z0-9_-]{11}$/.test(id)
      ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      : null;
  } catch {
    return null;
  }
}

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
