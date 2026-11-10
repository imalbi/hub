import type { Run } from '../../core/exec.ts';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { playerArgs } from './preference.ts';
import { MEDIA_FORMAT, parseMediaMetadata } from './playerctl.ts';

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 3000;

function imageMime(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  return null;
}

async function localBytes(url: URL) {
  // Validate the opened descriptor without ever waiting for a writer on a named pipe.
  const file = await open(url, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) return null;
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let size = 0;
    while (size <= MAX_BYTES) {
      const { bytesRead } = await file.read(bytes, size, bytes.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    return size <= MAX_BYTES ? bytes.subarray(0, size) : null;
  } finally {
    await file.close();
  }
}

async function remoteBytes(url: URL, fetcher: typeof fetch) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } finally {
    reader.releaseLock();
  }
}

export function createMediaArt(run: Run, { fetch: fetcher = fetch }: { fetch?: typeof fetch } = {}) {
  let cache: { key: string; dataUrl: string } | null = null;
  let pending: { key: string; value: Promise<{ key: string; dataUrl: string } | null> } | undefined;

  async function load(key: string, source: string) {
    try {
      const url = new URL(source);
      const bytes =
        url.protocol === 'file:'
          ? await localBytes(url)
          : url.protocol === 'https:'
            ? await remoteBytes(url, fetcher)
            : null;
      const mime = bytes && imageMime(bytes);
      return bytes && mime ? { key, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` } : null;
    } catch {
      // Missing files, invalid URLs, timeouts and non-images are normal; never leak a local source in errors.
      return null;
    }
  }

  return async () => {
    const metadata = parseMediaMetadata(
      await run('playerctl', [...(await playerArgs(run)), 'metadata', '--format', MEDIA_FORMAT]),
    );
    const key = metadata?.state.artKey;
    if (!key || !metadata?.artUrl) return null;
    if (cache?.key === key) return cache;
    if (pending?.key === key) return pending.value;
    const value = load(key, metadata.artUrl);
    pending = { key, value };
    const result = await value;
    if (pending?.value === value) {
      cache = result;
      pending = undefined;
    }
    return result;
  };
}
export type MediaArt = ReturnType<typeof createMediaArt>;
