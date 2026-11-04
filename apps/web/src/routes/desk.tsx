import { Link, Outlet, createFileRoute, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { DeskTheme } from '../desk/theme.tsx';
import { zones } from '../desk/zones.ts';
import { m } from '../paraglide/messages.js';
import { useLayout } from '../use-layout.ts';

export const Route = createFileRoute('/desk')({ component: Desk });
function Desk() {
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
    <DeskTheme>
      <nav aria-label={m.desk_zones()} className="fixed inset-y-xl left-xl flex w-desk-rail flex-col justify-center">
        <div className="flex flex-col items-center gap-xs rounded-full border border-border bg-surface p-xs">
          {zones.map(({ id, path, icon: Icon, label }) => (
            <Link
              key={id}
              to={path}
              activeOptions={{ exact: true }}
              aria-label={label()}
              title={label()}
              className="flex size-touch items-center justify-center rounded-full focus-visible:outline focus-visible:outline-accent"
              activeProps={{ className: 'bg-primary text-primary-foreground hover:opacity-80' }}
              inactiveProps={{ className: 'text-muted-foreground hover:bg-muted' }}
            >
              <Icon className="size-icon-lg" aria-hidden />
            </Link>
          ))}
        </div>
      </nav>
      <main className="min-h-dvh p-xl pl-desk-inset">
        <header className="mb-xl flex items-center justify-between gap-lg">
          <h1 className="text-heading">{active?.label() ?? m.desk_title()}</h1>
          <p className="text-label text-muted-foreground">{m.desk_title()}</p>
        </header>
        <div className="grid grid-cols-12 items-start gap-lg">
          <Outlet />
        </div>
      </main>
    </DeskTheme>
  );
}
