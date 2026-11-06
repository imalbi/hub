import type { ReactNode } from 'react';

/** The plain layout of a zone page until it gets its own design: panels in the desk's 12 columns. */
export function PageGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-12 items-start gap-lg">{children}</div>;
}
