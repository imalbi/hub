import type { Config } from './config.ts';

export const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://127.0.0.1:4180'];

// An Origin never carries a path, so a trailing slash is a typo; hosts are case-insensitive.
const normalize = (origin: string) => origin.replace(/\/+$/, '').toLowerCase();

/** A missing header is rejected: browsers always send Origin on a WebSocket upgrade, other clients have no business here. */
export function isAllowedOrigin(origin: string | undefined, allowlist: readonly string[]) {
  return origin !== undefined && origin !== '' && allowlist.some((allowed) => normalize(allowed) === normalize(origin));
}

export const allowedOrigins = ({ server }: Pick<Config, 'server'>) => [...DEV_ORIGINS, ...server.allowedOrigins];

const isLoopbackHost = (hostname: string) =>
  hostname === 'localhost' || hostname === '[::1]' || hostname.startsWith('127.');

/** The deck on the first configured LAN origin, or null when only loopback origins are listed (the dev origins are never in the config). */
export function deckUrl({ server }: { server: { allowedOrigins: readonly string[] } }) {
  for (const origin of server.allowedOrigins) {
    const url = URL.parse(origin);
    if (url && (url.protocol === 'http:' || url.protocol === 'https:') && !isLoopbackHost(url.hostname)) {
      return `${url.origin}/deck`;
    }
  }
  return null;
}
