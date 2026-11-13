import { Link } from '@tanstack/react-router';
import { EASE_THROW, useInteractionReducedMotion } from '../components/ui/ui-interaction-motion.ts';
import { useZones, zoneAt } from './zones.ts';
import { m } from '../paraglide/messages.js';
import { useConnectionLost } from '../lib/trpc.ts';
import { DeskCommandPalette } from './command-palette.tsx';

function Separator() {
  return <span aria-hidden className="h-px w-xl bg-border" />;
}

export function DeskRail({ pathname }: { pathname: string }) {
  const reduced = useInteractionReducedMotion();
  const zones = useZones();
  const current = zoneAt(pathname, zones);
  const index = Math.max(0, current ? zones.indexOf(current) : 0);
  const lost = useConnectionLost();
  return (
    <nav
      aria-label={m.desk_zones()}
      className="desk-glass fixed inset-y-0 left-xl z-40 my-auto flex h-fit w-desk-rail flex-col items-center gap-xs rounded-full border py-xs"
    >
      <DeskCommandPalette />
      <span aria-hidden className="-mt-xs text-caption whitespace-nowrap text-muted-foreground">
        Ctrl K
      </span>
      <Separator />
      <div className="relative flex flex-col items-center gap-xs">
        <span
          data-rail-indicator
          aria-hidden
          className="absolute top-0 left-0 size-touch rounded-full bg-primary"
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
      <Separator />
      <output
        aria-label={lost ? m.connection_lost() : m.connection_ready()}
        title={lost ? m.connection_lost() : m.connection_ready()}
        className="flex size-touch items-center justify-center"
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
