import { createContext, use, type ReactNode } from 'react';

export const SurfaceContext = createContext(false);
export const StatusLineContext = createContext<ReactNode>(null);
export function useInSurface() {
  return use(SurfaceContext);
}
