import { useQuery } from '@tanstack/react-query';
import { Link, Outlet } from '@tanstack/react-router';
import { m } from '../paraglide/messages.js';
import { useTRPC } from '../lib/trpc.ts';
import { useTheme } from '../theme/theme.tsx';
import { builtInThemes } from '../theme/themes.ts';
import { PageSurface } from '../shell/page-surface.tsx';
import { moduleLabel } from './module-label.ts';

const states = { on: m.settings_state_on, off: m.settings_state_off, failed: m.settings_state_failed } as const;
// `on` only has a dot when the module carries a note (not set up yet): muted, not the old green.
const dots = { on: 'bg-muted-foreground', off: 'border border-muted-foreground', failed: 'bg-danger' } as const;

const rowClass =
  'flex min-h-touch items-center gap-sm rounded-lg px-md text-body transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-accent';
// The list is an inner panel (`bg-muted`), so the open row and the hover are one step lighter, `bg-surface`.
const rowActive = { className: 'bg-surface' };

/** One page surface (step 47b): the list is an inner panel on the left, the page of the chosen entry opens beside it, scrolling on its own. */
export function SettingsLayout() {
  const trpc = useTRPC();
  const modules = useQuery(trpc.settings.modules.queryOptions());
  const catalog = useQuery(trpc.catalog.state.queryOptions());
  const catalogAttention =
    catalog.data?.pendingApply || catalog.data?.installed.some((module) => module.updateAvailable);
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
          <Link to="/desk/settings/catalog" className={rowClass} activeProps={rowActive}>
            <span className="grow">{m.catalog_title()}</span>
            {catalogAttention && (
              <span data-catalog-dot className="size-2xs shrink-0 rounded-full bg-muted-foreground">
                <span className="sr-only">{m.catalog_attention()}</span>
              </span>
            )}
          </Link>
          <p className="px-md pt-md text-label text-muted-foreground">{m.settings_modules()}</p>
          {modules.data
            ?.toSorted((a, b) => moduleLabel(a.name).localeCompare(moduleLabel(b.name), 'it'))
            .map(({ name, status, note }) => {
              // A module that is on and set up says nothing; the dot comes with the words, to the right of the label.
              const words = status === 'on' ? note : states[status]();
              return (
                <Link
                  key={name}
                  to="/desk/settings/$module"
                  params={{ module: name }}
                  className={`${rowClass} ${status === 'off' ? 'text-muted-foreground' : ''}`}
                  activeProps={rowActive}
                >
                  <span className="grow">{moduleLabel(name)}</span>
                  {words && (
                    <>
                      <span data-state-dot aria-hidden className={`size-2xs shrink-0 rounded-full ${dots[status]}`} />
                      <span className="text-label text-muted-foreground">{words}</span>
                    </>
                  )}
                  {/* A row with nothing to say still tells a screen reader that the module is on. */}
                  {!words && status === 'on' && <span className="sr-only">{states.on()}</span>}
                </Link>
              );
            })}
        </nav>
        {/* `relative`: the containing block of the sr-only live regions of the page, or they stretch the surface (step 33). */}
        <section className="relative min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <Outlet />
        </section>
      </PageSurface>
    </div>
  );
}
