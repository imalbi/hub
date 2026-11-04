import type { ReactNode } from 'react';
import { m } from '../paraglide/messages.js';

/** Every deck screen: the safe areas (notch, home indicator) outside, the page padding and the header inside. */
export function DeckFrame({ status, children }: { status?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex h-dvh flex-col overflow-hidden pt-safe-top pr-safe-right pb-safe-bottom pl-safe-left">
      <div className="flex min-h-0 flex-1 flex-col gap-xl p-md">
        <header className="flex items-center justify-between gap-xs">
          <p className="text-label">{m.deck_title()}</p>
          <p className="text-caption text-muted-foreground">{status}</p>
        </header>
        {children}
      </div>
    </main>
  );
}
