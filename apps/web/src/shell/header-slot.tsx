import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** The element in the desk header where a zone may put its own actions (Panoramica's "Modifica"). */
export const HeaderSlot = createContext<HTMLElement | null>(null);

export function HeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlot);
  return slot ? createPortal(children, slot) : null;
}
