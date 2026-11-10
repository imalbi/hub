import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ThemeProvider } from '../theme/theme.tsx';
import { useZones, zoneAt } from './zones.ts';
import { m } from '../paraglide/messages.js';
import { useLayout } from './use-layout.ts';
import { DeskRail } from './rail.tsx';
import { MediaProvider } from '../modules/media/media-provider.tsx';
import { DeskBackdrop } from './backdrop.tsx';
import { HeaderActivity } from './header-activity.tsx';
import { HeaderSlot } from './header-slot.tsx';
import { DeskCommandPalette } from './command-palette.tsx';
import { RestartScreen } from '../settings/restart-screen.tsx';

/** The desk frame: theme, backdrop, rail, header, keys 1-9 and the zone grid the child routes render into. */
export function DeskShell() {
  useLayout('desk');
  const zones = useZones();
  const location = useLocation();
  const navigate = useNavigate();
  // A callback ref into state, so zones can portal their actions into the header once it exists.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const active = zoneAt(location.pathname, zones);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
        return;
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
      )
        return;
      const zone = /^[1-9]$/.test(event.key) ? zones[Number(event.key) - 1] : undefined;
      if (zone) {
        event.preventDefault();
        void navigate({ to: zone.path, params: zone.params });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, zones]);
  return (
    <ThemeProvider remote>
      <MediaProvider>
        <RestartScreen />
        <DeskBackdrop media={location.pathname === '/desk/media'} />
        <DeskRail pathname={location.pathname} />
        <main className="flex h-dvh flex-col overflow-hidden px-xl pt-xl pl-desk-inset">
          <header className="mb-xl flex shrink-0 items-center gap-lg">
            <h1 className="flex-1 text-heading">{active?.label() ?? m.desk_title()}</h1>
            <DeskCommandPalette />
            <div className="flex flex-1 items-center justify-end gap-md">
              <div ref={setSlot} className="flex items-center gap-xs" />
              <HeaderActivity />
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto [&:has([data-fill])]:overflow-hidden">
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
