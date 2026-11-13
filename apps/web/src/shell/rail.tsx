import { Link } from '@tanstack/react-router';
import { EASE_THROW, useInteractionReducedMotion } from '../components/ui/ui-interaction-motion.ts';
import { useZones, zoneAt } from './zones.ts';
import { m } from '../paraglide/messages.js';
import { useConnectionLost } from '../lib/trpc.ts';
import { DeskCommandPalette } from './command-palette.tsx';

export function DeskRail({ pathname }: { pathname: string }) {
  const reduced = useInteractionReducedMotion();
  const zones = useZones();
  const current = zoneAt(pathname, zones);
  const index = Math.max(0, current ? zones.indexOf(current) : 0);
  const lost = useConnectionLost();
  return (
    <nav
      aria-label={m.desk_zones()}
      className="desk-rail fixed inset-y-xl left-xl z-40 grid w-desk-rail justify-items-center"
    >
      <div className="flex flex-col items-center gap-3xs self-start">
        <DeskCommandPalette />
        <span aria-hidden className="text-caption whitespace-nowrap text-muted-foreground">
          Ctrl K
        </span>
      </div>
      <div className="desk-glass relative flex flex-col items-center gap-xs rounded-full border p-xs">
        <span
          data-rail-indicator
          aria-hidden
          className="absolute top-xs left-xs size-touch rounded-full bg-primary"
          style={{
            transform: `translateY(calc(${index} * (var(--spacing-touch) + var(--spacing-xs))))`,
            transition: reduced ? 'none' : `transform var(--motion-standard) ${EASE_THROW}`,
          }}
        />
        {zones.map(({ id, path, params, icon: Icon, label }) => (
          <Link
            key={id}
            to={path}
            params={params}
            activeOptions={{ exact: path === '/desk', includeSearch: false }}
            aria-label={label()}
            title={label()}
            className="group relative flex size-touch items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-accent"
            activeProps={{ className: 'text-primary-foreground' }}
            inactiveProps={{ className: 'text-muted-foreground hover:text-foreground' }}
          >
            <Icon className="size-icon-lg" aria-hidden />
            <span
              aria-hidden
              className="desk-rail-label pointer-events-none absolute left-full ml-md rounded-full border border-border bg-surface px-md py-xs text-label whitespace-nowrap text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              {label()}
            </span>
          </Link>
        ))}
      </div>
      <output
        aria-label={lost ? m.connection_lost() : m.connection_ready()}
        title={lost ? m.connection_lost() : m.connection_ready()}
        className="flex size-touch items-center justify-center self-end"
      >
        <span className="relative flex size-xs">
          {!lost && (
            <span className="absolute inset-0 [animation:ui-ping_1.6s_cubic-bezier(0,0,0.2,1)_infinite] rounded-full bg-success motion-reduce:hidden" />
          )}
          <span className={`relative size-xs rounded-full ${lost ? 'bg-danger' : 'bg-success'}`} />
        </span>
      </output>
    </nav>
  );
}
