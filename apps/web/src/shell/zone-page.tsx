import { notFound, useSearch } from '@tanstack/react-router';
import { ZoneTabs } from '../components/zone-tabs.tsx';
import { useLiveModuleUIs } from '../lib/enabled-modules.ts';
import type { PageTab } from '../lib/module-ui.ts';
import { pageTabs } from './zone-sections.ts';
import { useSitesConfigured } from '../modules/sites/sites.tsx';
import { DayLine } from './day-line.tsx';
import { m } from '../paraglide/messages.js';
import { activeTab } from '../lib/zone-search.ts';
import { PageSurface } from './page-surface.tsx';

/** The frame of a zone page: its own tabs, then the sections modules aim at it, behind a bar when there are two or more. */
export function ZonePage({ zone, own }: { zone: string; own: PageTab[] }) {
  const tabs = pageTabs(zone, own, useLiveModuleUIs());
  const sites = useSitesConfigured(zone === 'work');
  const { tab } = useSearch({ strict: false });
  const active = activeTab(
    tabs.map(({ id }) => id),
    typeof tab === 'string' ? tab : undefined,
  );
  const always = zone === 'messages';
  // Every zone page fills the desk height: the tabs stay fixed above the surface, which scrolls (or lays out its own lists).
  const activeTabDef = tabs.find(({ id }) => id === active);
  const ownScroll = activeTabDef?.fill;
  const float = activeTabDef?.float;
  // A zone made only of module sections has no page without them.
  if (tabs.length === 0 && zone === 'work' && sites.isPending)
    return (
      <div data-fill className="col-span-12 flex h-full min-h-0 flex-col gap-lg">
        <PageSurface>
          <output
            aria-label={m.tile_loading()}
            className="@container block rounded-xl border border-border bg-background"
          >
            <h2 className="flex items-center gap-sm border-b border-border p-lg text-title">
              <span aria-hidden className="relative">
                <span className="invisible">{m.sites_unknown()}</span>
                <span className="absolute inset-0 rounded-sm bg-muted-foreground/20 motion-safe:animate-pulse" />
              </span>
            </h2>
            <section aria-label={m.sites_title()} className="px-lg">
              <article className="border-b border-border py-md">
                <span
                  aria-hidden
                  className="block h-md w-3xl rounded-sm bg-muted-foreground/20 motion-safe:animate-pulse"
                />
                <span
                  aria-hidden
                  className="mt-sm block h-touch rounded-sm bg-muted-foreground/20 motion-safe:animate-pulse"
                />
              </article>
            </section>
          </output>
        </PageSurface>
      </div>
    );
  if (tabs.length === 0) throw notFound();
  return (
    <div data-fill className="col-span-12 flex h-full min-h-0 flex-col gap-lg">
      <ZoneTabs
        dayLine={zone === 'study' && active === 'study' ? <DayLine /> : undefined}
        always={always}
        fill={ownScroll}
        float={float}
        tabs={tabs.map(({ id, label, component: Content }) => ({ id, label: label(), content: <Content /> }))}
      />
    </div>
  );
}
