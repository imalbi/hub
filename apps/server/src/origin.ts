import type { Config } from './config.ts';

export const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://127.0.0.1:4180'];

// An Origin never carries a path, so a trailing slash is a typo; hosts are case-insensitive.
const normalize = (origin: string) => origin.replace(/\/+$/, '').toLowerCase();

/** A missing header is rejected: browsers always send Origin on a WebSocket upgrade, other clients have no business here. */
export function isAllowedOrigin(origin: string | undefined, allowlist: readonly string[]) {
  return origin !== undefined && origin !== '' && allowlist.some((allowed) => normalize(allowed) === normalize(origin));
}

export const allowedOrigins = ({ server }: Pick<Config, 'server'>) => [...DEV_ORIGINS, ...server.allowedOrigins];
