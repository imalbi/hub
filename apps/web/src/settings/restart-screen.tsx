import { CircleNotchIcon } from '@phosphor-icons/react';
import { m } from '../paraglide/messages.js';
import { useRestartPhase } from './restart.ts';

/** Over the whole desk while Hub restarts after a save; the page comes back by itself when the socket does. */
export function RestartScreen() {
  const phase = useRestartPhase();
  if (phase === 'idle') return null;
  if (phase === 'done')
    return (
      <output className="desk-glass fixed right-4xl bottom-xl z-50 flex items-center gap-sm rounded-full border px-md py-sm text-body">
        {m.settings_restart_done()}
      </output>
    );
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80">
      <p className="desk-glass fixed top-xl right-xl flex items-center gap-xs rounded-full border px-md py-xs text-label">
        <span aria-hidden className="size-2xs rounded-full bg-accent" />
        {m.settings_restart_badge()}
      </p>
      <output className="flex w-popover-md max-w-full flex-col items-center gap-md rounded-xl border border-border bg-surface px-xl py-xl text-center">
        <CircleNotchIcon aria-hidden className="size-icon-lg animate-spin text-foreground motion-reduce:animate-none" />
        <p className="text-title">{m.settings_restart_title()}</p>
        <p className="text-body text-muted-foreground">{m.settings_restart_text()}</p>
      </output>
    </div>
  );
}
