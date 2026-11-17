import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** The end of a zone page's tab bar, where a section may put its own controls (Posta's account switch and Scrivi). */
export const TabBarSlot = createContext<HTMLElement | null>(null);

export function TabBarActions({ children }: { children: ReactNode }) {
  const slot = useContext(TabBarSlot);
  return slot ? createPortal(children, slot) : null;
}
