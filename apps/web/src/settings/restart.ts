import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { wsClient } from '../lib/trpc.ts';

/**
 * What the desk shows around a restart of Hub. `waiting`: the save was answered and the socket is still up. `down`:
 * it dropped, Hub is starting again. `done`: it answered again, shown for a few seconds. The page itself never reloads.
 */
export type RestartPhase = 'idle' | 'waiting' | 'down' | 'done';

// A save that did not take the socket down (nothing restarted after all) gives up waiting after this long.
const GIVE_UP_MS = 15_000;
const DONE_MS = 5_000;

let phase: RestartPhase = 'idle';
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

function set(next: RestartPhase) {
  phase = next;
  for (const listener of listeners) listener();
}

/** Call once a save or a restore was answered with `restarting: true`. */
export function beginRestart(queryClient: QueryClient) {
  clearTimeout(timer);
  set('waiting');
  timer = setTimeout(() => {
    unsubscribe?.();
    set('idle');
  }, GIVE_UP_MS);
  const subscription = wsClient.connectionState.subscribe({
    next: ({ state, error }) => {
      if (phase === 'waiting' && state === 'connecting' && error !== null) {
        clearTimeout(timer);
        set('down');
      } else if (phase === 'down' && state === 'pending') {
        unsubscribe?.();
        // What was on screen was read from the old process: every query reads the new one.
        void queryClient.invalidateQueries();
        set('done');
        timer = setTimeout(() => set('idle'), DONE_MS);
      }
    },
  });
  unsubscribe = () => subscription.unsubscribe();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const useRestartPhase = () => useSyncExternalStore(subscribe, () => phase);
