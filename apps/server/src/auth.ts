import { createHash, randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { eq } from 'drizzle-orm';
import type { Db } from './db/index.ts';
import { devices } from './db/schema.ts';

export type Client = { kind: 'loopback' } | { kind: 'device'; deviceId: number } | { kind: 'anonymous' };

/** What decides who is calling. A Fastify request and the raw WebSocket upgrade request both have this shape. */
export type Peer = { socket: { remoteAddress?: string | undefined }; headers: IncomingHttpHeaders };
export type IsLoopback = (peer: Peer) => boolean;

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** The TCP peer address only. `X-Forwarded-For` is never read: any LAN client can send it. */
export const isLoopbackPeer: IsLoopback = ({ socket }) => LOOPBACK_ADDRESSES.has(socket.remoteAddress ?? '');

export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** `Authorization: Bearer <token>` over HTTP; a WebSocket cannot set headers from a browser, so it sends `token` in its connection params. */
export function extractToken(
  authorization: string | undefined,
  connectionParams: Record<string, string | undefined> | null,
) {
  return /^Bearer (.+)$/.exec(authorization ?? '')?.[1] ?? connectionParams?.['token'] ?? null;
}

const SEEN_EVERY_MS = 60_000;

export async function resolveClient(db: Db, isLoopback: IsLoopback, peer: Peer, token: string | null): Promise<Client> {
  if (isLoopback(peer)) return { kind: 'loopback' };
  if (!token) return { kind: 'anonymous' };
  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.tokenHash, hashToken(token)))
    .limit(1);
  if (!device) return { kind: 'anonymous' };
  const now = Date.now();
  // Not on every request: the deck polls nothing, but a socket and its calls would otherwise write all day.
  if (now - device.lastSeenAt.getTime() >= SEEN_EVERY_MS)
    await db
      .update(devices)
      .set({ lastSeenAt: new Date(now) })
      .where(eq(devices.id, device.id));
  return { kind: 'device', deviceId: device.id };
}

type Closable = { close(code?: number, reason?: string): void; once(event: 'close', listener: () => void): unknown };

/** For a tRPC WebSocket, the adapter hands the socket over where the typings say `FastifyReply`. */
export const isSocket = (value: unknown): value is Closable =>
  typeof value === 'object' &&
  value !== null &&
  'close' in value &&
  typeof value.close === 'function' &&
  'once' in value &&
  typeof value.once === 'function';

/** The open sockets of each paired device, so revoking one can close them: a socket is authenticated once, when it connects. */
export function createDeviceSockets() {
  const open = new Map<number, Set<Closable>>();

  function track(deviceId: number, socket: Closable) {
    const sockets = open.get(deviceId) ?? new Set<Closable>();
    open.set(deviceId, sockets);
    sockets.add(socket);
    socket.once('close', () => {
      sockets.delete(socket);
      if (sockets.size === 0) open.delete(deviceId);
    });
  }

  function closeAll(deviceId: number) {
    for (const socket of open.get(deviceId) ?? []) socket.close(4401, 'Device revoked');
  }

  return { track, closeAll };
}

export type DeviceSockets = ReturnType<typeof createDeviceSockets>;
