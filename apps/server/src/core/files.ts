/* oxlint-disable no-control-regex -- File names must reject HTTP header control characters. */
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

const metadata = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^\x00-\x1f\x7f/\\]+$/),
  mime: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/),
});
const lifetime = 60 * 60 * 1000;
const defaultMaxEntries = 50;
const defaultMaxTotalBytes = 100 * 1024 * 1024;

export function createFiles({
  maxEntries = defaultMaxEntries,
  maxTotalBytes = defaultMaxTotalBytes,
}: { maxEntries?: number; maxTotalBytes?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hub-files-'));
  const entries = new Map<
    string,
    { name: string; mime: string; path: string; size: number; expires: number; timer: NodeJS.Timeout }
  >();
  async function remove(id: string) {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    clearTimeout(entry.timer);
    await rm(entry.path, { force: true });
  }
  async function pruneExpired(now: number) {
    const expired = [...entries.entries()].filter(([, entry]) => entry.expires <= now).map(([id]) => id);
    for (const id of expired) await remove(id);
  }
  async function get(fileId: string) {
    const entry = entries.get(fileId);
    if (!entry || entry.expires <= Date.now()) {
      await remove(fileId);
      throw new TRPCError({ code: 'NOT_FOUND', message: 'File not found or expired' });
    }
    return { fileId, name: entry.name, mime: entry.mime, path: entry.path };
  }
  async function put(data: Uint8Array, details: z.infer<typeof metadata>) {
    const { name, mime } = metadata.parse(details);
    const now = Date.now();
    await pruneExpired(now);
    let totalBytes = 0;
    for (const entry of entries.values()) totalBytes += entry.size;
    if (entries.size >= maxEntries || totalBytes + data.byteLength > maxTotalBytes) {
      throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: 'Temporary file storage quota exceeded' });
    }
    const fileId = randomUUID();
    const path = join(root, fileId);
    await writeFile(path, data, { flag: 'wx', mode: 0o600 });
    const timer = setTimeout(() => {
      void remove(fileId).catch(() => {});
    }, lifetime);
    timer.unref();
    entries.set(fileId, { name, mime, path, size: data.byteLength, expires: now + lifetime, timer });
    return { fileId, name, mime };
  }
  async function read(fileId: string) {
    return readFile((await get(fileId)).path);
  }
  async function close() {
    for (const entry of entries.values()) clearTimeout(entry.timer);
    entries.clear();
    await rm(root, { recursive: true, force: true });
  }
  return { get, put, read, close };
}
export type Files = ReturnType<typeof createFiles>;
