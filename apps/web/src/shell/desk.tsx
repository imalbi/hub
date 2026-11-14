import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ThemeProvider } from '../theme/theme.tsx';
import { useZones, zoneAt } from './zones.ts';
import { m } from '../paraglide/messages.js';
import { useLayout } from './use-layout.ts';
import { DeskRail } from './rail.tsx';
import { MediaProvider } from '../modules/media/media-provider.tsx';
import { DeskBackdrop } from './backdrop.tsx';
import { ActivityBall } from './activity.tsx';
import { HeaderSlot } from './header-slot.tsx';
import { RestartScreen } from '../settings/restart-screen.tsx';
import { AgentConfirmation } from './agent-confirmation.tsx';
import { useIsOn } from '../lib/enabled-modules.ts';
import { NoteCapture } from '../modules/notes/capture.tsx';
import { openCapture } from '../modules/notes/store.ts';
import { NoteUndoToast } from '../modules/notes/undo-toast.tsx';

/** The desk frame: theme, backdrop, rail (zones, palette, status), the activity ball, the top-right page actions, keys 1-9, N for a post-it and the zone grid the child routes render into. */
export function DeskShell() {
  useLayout('desk');
  const zones = useZones();
  const location = useLocation();
  const navigate = useNavigate();
  // A callback ref into state, so zones can portal their actions into the header once it exists.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const active = zoneAt(location.pathname, zones);
  const notesOn = useIsOn()('notes');
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
        return;
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
      )
        return;
      // N opens the post-it card from any desk page, unless a dialog (the palette, a card already open) is on screen.
      if (notesOn && event.key.toLowerCase() === 'n' && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        openCapture();
        return;
      }
      const zone = /^[1-9]$/.test(event.key) ? zones[Number(event.key) - 1] : undefined;
      if (zone) {
        event.preventDefault();
        void navigate({ to: zone.path, params: zone.params });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, notesOn, zones]);
  return (
    <ThemeProvider remote>
      <MediaProvider>
        <RestartScreen />
        <AgentConfirmation />
        {notesOn && <NoteCapture />}
        {notesOn && <NoteUndoToast />}
        <DeskBackdrop media={location.pathname === '/desk/media'} />
        <DeskRail pathname={location.pathname} />
        <ActivityBall />
        <main className="flex h-dvh flex-col overflow-hidden pt-xl pl-desk-inset">
          <h1 className="sr-only">{active?.label() ?? m.desk_title()}</h1>
          {/* Floating top right: the page's own actions (Panoramica's Modifica); the activity ball is on the left, by the rail. */}
          <header className="pointer-events-none fixed top-md right-xl z-30 flex h-ball items-center [&>*]:pointer-events-auto">
            <div ref={setSlot} className="flex items-center gap-xs" />
          </header>
          {/* `relative`: the containing block of absolutely placed sr-only nodes, or they stretch the document past the scroller. The right padding sits inside it so the scrollbar is flush with the window edge. */}
          <div className="relative min-h-0 flex-1 overflow-y-auto pr-xl [&:has([data-fill])]:overflow-hidden">
            <div className="grid min-h-full grid-cols-12 items-start gap-lg pb-xl [&:has([data-fill])]:h-full [&:has([data-fill])]:pb-0">
              <HeaderSlot value={slot}>
                <Outlet />
              </HeaderSlot>
            </div>
          </div>
        </main>
      </MediaProvider>
    </ThemeProvider>
  );
}
