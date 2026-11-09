// Hairline UI · command-palette (Kbd) · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

import type * as React from 'react';

/** A key cap, for shortcut hints. Only the key cap is kept from the upstream command palette; the palette itself is cmdk. */
export function Kbd({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={`flex h-icon min-w-icon items-center justify-center rounded-sm px-2xs font-sans text-caption text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] ${className}`}
    >
      {children}
    </kbd>
  );
}
