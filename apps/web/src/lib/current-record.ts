import { useSyncExternalStore } from 'react';

export type CurrentRecord = { source: string; id: string; title: string };
let current: CurrentRecord | null = null;
const listeners = new Set<() => void>();

export function setCurrentRecord(record: CurrentRecord | null) {
  current = record;
  for (const listener of listeners) listener();
}

export function getCurrentRecord() {
  return current;
}

export function useCurrentRecord() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getCurrentRecord);
}
