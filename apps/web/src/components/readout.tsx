import type { ReactNode } from 'react';

export function Readout({ children, unit }: { children: ReactNode; unit?: ReactNode }) {
  return (
    <span data-readout className="text-readout">
      {children}
      {unit && <span className="text-mono-label text-muted-foreground"> {unit}</span>}
    </span>
  );
}
