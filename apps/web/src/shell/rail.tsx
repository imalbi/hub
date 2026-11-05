import { Link } from '@tanstack/react-router';
import { EASE_THROW, useInteractionReducedMotion } from '../components/ui/ui-interaction-motion.ts';
import { zones, zonePath } from './zones.ts';
import { m } from '../paraglide/messages.js';

export function DeskRail({ pathname }: { pathname: string }) {
  const reduced = useInteractionReducedMotion();
  const index = Math.max(
    0,
    zones.findIndex((zone) => zonePath(zone) === pathname.replace(/\/$/, '')),
  );
  return (
    <nav
      aria-label={m.desk_zones()}
      className="desk-rail fixed inset-y-xl left-xl z-40 flex w-desk-rail flex-col justify-center"
    >
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
            activeOptions={{ exact: true }}
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
    </nav>
  );
}
