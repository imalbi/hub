import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** The element in the desk header where a zone may put its own actions (Panoramica's "Modifica"). */
export const HeaderSlot = createContext<HTMLElement | null>(null);

/** The end of a zone page's tab bar, where a section may put its own controls (Posta's account switch and Scrivi). */
export const TabBarSlot = createContext<HTMLElement | null>(null);

export function TabBarActions({ children }: { children: ReactNode }) {
  const slot = useContext(TabBarSlot);
  return slot ? createPortal(children, slot) : null;
}

export function HeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlot);
  return slot ? createPortal(children, slot) : null;
}
