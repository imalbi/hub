import { useQuery } from '@tanstack/react-query';
import { Link, Outlet } from '@tanstack/react-router';
import { m } from '../paraglide/messages.js';
import { useTRPC } from '../lib/trpc.ts';
import { useTheme } from '../theme/theme.tsx';
import { builtInThemes } from '../theme/themes.ts';
import { PageSurface } from '../shell/page-surface.tsx';
import { moduleLabel } from './module-label.ts';

const states = { on: m.settings_state_on, off: m.settings_state_off, failed: m.settings_state_failed } as const;
const dots = { on: 'bg-success', off: 'border border-muted-foreground', failed: 'bg-danger' } as const;

const rowClass =
  'flex min-h-touch items-center gap-sm rounded-lg px-md text-body transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-accent';
// The list is an inner panel (`bg-muted`), so the open row and the hover are one step lighter, `bg-surface`.
const rowActive = { className: 'bg-surface' };

/** One page surface (step 47b): the list is an inner panel on the left, the page of the chosen entry opens beside it, scrolling on its own. */
export function SettingsLayout() {
  const trpc = useTRPC();
  const modules = useQuery(trpc.settings.modules.queryOptions());
  const { theme, custom } = useTheme();
  const themeName =
    builtInThemes.find((entry) => entry.id === theme)?.label() ??
    custom?.find((entry) => `custom-${entry.id}` === theme)?.name;
  return (
    <div data-fill className="col-span-12 flex h-full min-h-0 flex-col gap-lg">
      <PageSurface fill className="flex-row gap-lg">
        <nav
          aria-label={m.zone_tabs()}
          data-panel=""
          className="flex w-library-col shrink-0 flex-col gap-3xs overflow-y-auto rounded-lg bg-muted p-xs"
        >
          <p className="px-md pt-xs text-label text-muted-foreground">{m.settings_general()}</p>
          <Link to="/desk/settings/appearance" className={rowClass} activeProps={rowActive}>
            <span className="grow">{m.theme_title()}</span>
            {themeName && <span className="text-label text-muted-foreground">{themeName}</span>}
          </Link>
          <Link to="/desk/settings/core" className={rowClass} activeProps={rowActive}>
            <span className="grow">{m.settings_core()}</span>
          </Link>
          <p className="px-md pt-md text-label text-muted-foreground">{m.settings_modules()}</p>
          {modules.data?.map(({ name, status }) => (
            <Link
              key={name}
              to="/desk/settings/$module"
              params={{ module: name }}
              className={`${rowClass} ${status === 'off' ? 'text-muted-foreground' : ''}`}
              activeProps={rowActive}
            >
              <span aria-hidden className={`size-2xs shrink-0 rounded-full ${dots[status]}`} />
              <span className="grow">{moduleLabel(name)}</span>
              {status !== 'on' && <span className="text-label text-muted-foreground">{states[status]()}</span>}
              {/* The dot and the quiet label are not enough on their own: the row says its state to a screen reader. */}
              {status === 'on' && <span className="sr-only">{states.on()}</span>}
            </Link>
          ))}
        </nav>
        {/* `relative`: the containing block of the sr-only live regions of the page, or they stretch the surface (step 33). */}
        <section className="relative min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <Outlet />
        </section>
      </PageSurface>
    </div>
  );
}
