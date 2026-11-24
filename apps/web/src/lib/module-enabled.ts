import { createContext, useContext } from 'react';

export const EnabledContext = createContext<readonly string[] | undefined>(undefined);

/** Before the first modules.enabled answer, keep the existing on state. */
export function useModuleEnabled(name: string) {
  const enabled = useContext(EnabledContext);
  return !enabled || enabled.includes(name);
}
