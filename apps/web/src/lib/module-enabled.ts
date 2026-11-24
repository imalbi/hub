import { createContext, useContext } from 'react';

export const EnabledContext = createContext<readonly string[] | undefined>(undefined);
export const AvailabilityContext = createContext<Record<string, { available: boolean; pending: boolean }>>({});

/** Before the first modules.enabled answer, keep the existing on state. */
export function useModuleEnabled(name: string) {
  const enabled = useContext(EnabledContext);
  return !enabled || enabled.includes(name);
}

/** Module hooks combine enabled state and runtime availability without importing the module UI registry. */
export function useIsOn() {
  const enabled = useContext(EnabledContext);
  const availability = useContext(AvailabilityContext);
  return (name: string) => (!enabled || enabled.includes(name)) && (availability[name]?.available ?? true);
}
