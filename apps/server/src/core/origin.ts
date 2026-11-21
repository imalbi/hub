import type { Config } from './config.ts';

export const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4180',
  'http://127.0.0.1:4180',
];

const MAX_ORIGIN_LENGTH = 256;
const MAX_HOST_LENGTH = 256;
const HOST_CHARS = /^[A-Za-z0-9.:[\]-]+$/;

// An Origin never carries a path, so a trailing slash is a typo; hosts are case-insensitive.
function normalize(origin: string) {
  let end = origin.length;
  while (end > 0 && origin.charCodeAt(end - 1) === 47) end--;
  return origin.slice(0, end).toLowerCase();
}

/** A missing header is rejected: browsers always send Origin on a WebSocket upgrade, other clients have no business here. */
export function isAllowedOrigin(origin: string | undefined, allowlist: readonly string[]) {
  if (origin === undefined || origin === '' || origin.length > MAX_ORIGIN_LENGTH) return false;
  const normalized = normalize(origin);
  return allowlist.some((allowed) => allowed.length <= MAX_ORIGIN_LENGTH && normalize(allowed) === normalized);
}

/** Allowed Host header hostnames: loopback names plus the hostname of each configured origin. */
export function allowedHostnames(allowlist: readonly string[]) {
  const hosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  for (const entry of allowlist) {
    const parsed = URL.parse(entry);
    if (parsed?.hostname) hosts.add(parsed.hostname.toLowerCase());
  }
  return hosts;
}

/** Rejects missing, multi-valued, malformed, obfuscated or foreign Host headers to block DNS rebinding. */
export function isAllowedHost(host: string | string[] | undefined, allowlist: readonly string[]) {
  if (typeof host !== 'string' || host.length === 0 || host.length > MAX_HOST_LENGTH || !HOST_CHARS.test(host))
    return false;
  let rawHost: string;
  if (host.startsWith('[')) {
    const close = host.indexOf(']');
    if (close === -1) return false;
    rawHost = host.slice(0, close + 1);
    const rest = host.slice(close + 1);
    if (rest !== '' && !/^:\d{1,5}$/.test(rest)) return false;
  } else {
    if (host.includes('[') || host.includes(']')) return false;
    const colon = host.indexOf(':');
    if (colon !== -1) {
      const rest = host.slice(colon);
      if (!/^:\d{1,5}$/.test(rest)) return false;
      rawHost = host.slice(0, colon);
    } else rawHost = host;
  }
  const url = URL.parse(`http://${host}`);
  if (
    !url ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  )
    return false;
  if (rawHost.toLowerCase() !== url.hostname.toLowerCase()) return false;
  return allowedHostnames(allowlist).has(url.hostname.toLowerCase());
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
