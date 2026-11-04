import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ThemeProvider } from '../theme/theme.tsx';
import { zones } from './zones.ts';
import { m } from '../paraglide/messages.js';
import { useLayout } from './use-layout.ts';
import { DeskRail } from './rail.tsx';
import { MediaProvider } from '../modules/media/media-provider.tsx';
import { DeskBackdrop } from './backdrop.tsx';
import { HeaderActivity } from './header-activity.tsx';

/** The desk frame: theme, backdrop, rail, header, keys 1-5 and the zone grid the child routes render into. */
export function DeskShell() {
  useLayout('desk');
  const location = useLocation();
  const navigate = useNavigate();
  const active = zones.find((zone) => zone.path === location.pathname.replace(/\/$/, ''));
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
        return;
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
      )
        return;
      const zone = /^[1-5]$/.test(event.key) ? zones[Number(event.key) - 1] : undefined;
      if (zone) {
        event.preventDefault();
        void navigate({ to: zone.path });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
  return (
    <ThemeProvider remote>
      <MediaProvider>
        <DeskBackdrop media={location.pathname === '/desk/media'} />
        <DeskRail pathname={location.pathname} />
        <main className="min-h-dvh p-xl pl-desk-inset">
          <header className="mb-xl flex items-center justify-between gap-lg">
            <h1 className="text-heading">{active?.label() ?? m.desk_title()}</h1>
            <HeaderActivity />
          </header>
          <div className="grid grid-cols-12 items-start gap-lg">
            <Outlet />
          </div>
        </main>
      </MediaProvider>
    </ThemeProvider>
  );
}
