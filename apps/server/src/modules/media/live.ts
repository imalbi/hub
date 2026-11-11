import type { Run } from '../../core/exec.ts';
import { createLiveHub } from '../../core/live.ts';
import { playerArgs } from './preference.ts';
import { createHash } from 'node:crypto';
import { MEDIA_FORMAT, parseMediaMetadata, parsePosition, youtubeArtwork } from './playerctl.ts';

export async function readMediaMetadata(run: Run) {
  const args = await playerArgs(run);
  const metadata = parseMediaMetadata(await run('playerctl', [...args, 'metadata', '--format', MEDIA_FORMAT]));
  if (!metadata) return null;
  if (!metadata.artUrl && args.length) {
    const source = await run('playerctl', [...args, 'metadata', 'xesam:url']);
    const artUrl = source.code === 0 ? youtubeArtwork(source.stdout.trim()) : null;
    if (artUrl) {
      metadata.artUrl = artUrl;
      metadata.state.artKey = createHash('sha256').update(artUrl).digest('hex').slice(0, 16);
    }
  }
  return { metadata, args };
}

export async function readMediaState(run: Run) {
  const current = await readMediaMetadata(run);
  if (!current) return null;
  const positionMs = parsePosition(await run('playerctl', [...current.args, 'position']));
  return { ...current.metadata.state, positionMs };
}

export const createMediaLive = (run: Run) => createLiveHub(() => readMediaState(run));
export type MediaLive = ReturnType<typeof createMediaLive>;
