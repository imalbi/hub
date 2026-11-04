import { createWSClient } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useSyncExternalStore } from 'react';
import type { AppRouter } from '@hub/server';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// Derived from `location` so it works through the Vite proxy in dev and straight from the server on the LAN later.
// The browser sends the page origin with the upgrade; the server refuses origins that are not Hub's.
export const wsClient = createWSClient({
  url: () => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/trpc`,
});

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
