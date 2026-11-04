import { useSyncExternalStore } from 'react';

const KEY = 'hub.token';
const listeners = new Set<() => void>();

export const getToken = () => localStorage.getItem(KEY);

/** Stores the device token, or forgets it with `null`. Use `replaceToken` from `trpc.ts`, which also renews the socket. */
export function setToken(token: string | null) {
  if (token === null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, token);
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The stored device token, `null` when this browser is not paired. */
export const useToken = () => useSyncExternalStore(subscribe, getToken);
