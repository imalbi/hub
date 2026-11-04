import { createWSClient } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useSyncExternalStore } from 'react';
import type { AppRouter } from '@hub/server';
import { getToken, setToken } from './auth.ts';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

// Derived from `location` so it works through the Vite proxy in dev and straight from the server on the LAN later.
// The browser sends the page origin with the upgrade; the server refuses origins that are not Hub's.
export const wsClient = createWSClient({
  url: () => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/trpc`,
  // A browser cannot set headers on a WebSocket, so the device token travels as the first message. Read on every
  // (re)connect, because the server decides who this socket is once, when it connects.
  connectionParams: () => {
    const token = getToken();
    return token ? { token } : null;
  },
});

/** Pair (a token) or unpair (`null`): the socket in use was authenticated with the old token, so it is closed first and the next subscription opens a new one. */
export async function replaceToken(token: string | null) {
  await wsClient.close();
  setToken(token);
}

// `connecting` with an error means the socket closed or failed and the client is retrying; without one it is the first attempt.
const isConnectionLost = () => {
  const { state, error } = wsClient.connectionState.get();
  return state === 'connecting' && error !== null;
};

const subscribeToConnection = (onChange: () => void) => {
  const subscription = wsClient.connectionState.subscribe({ next: onChange });
  return () => subscription.unsubscribe();
};

/** True while the live WebSocket is down: the state on screen is the last one received, not the current one. */
export const useConnectionLost = () => useSyncExternalStore(subscribeToConnection, isConnectionLost);
