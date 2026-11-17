import { createContext, use } from 'react';

export const SurfaceContext = createContext(false);
export function useInSurface() {
  return use(SurfaceContext);
}
