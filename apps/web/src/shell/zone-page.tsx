import { ContentBoundary } from './content-boundary.tsx';
import { notFound, useSearch } from '@tanstack/react-router';
import { ZoneTabs } from '../components/zone-tabs.tsx';
import { LoadingSkeleton } from '../components/ui/loading-skeleton.tsx';
import { usePendingModule, useLiveModuleUIs } from '../lib/enabled-modules.ts';
import type { PageTab } from '../lib/module-ui.ts';
import { pageTabs } from './zone-sections.ts';
import { m } from '../paraglide/messages.js';
import { activeTab } from '../lib/zone-search.ts';
import { PageSurface } from './page-surface.tsx';

/** The frame of a zone page: its own tabs, then the sections modules aim at it, behind a bar when there are two or more. */
export function ZonePage({ zone, own }: { zone: string; own: PageTab[] }) {
  const tabs = pageTabs(zone, own, useLiveModuleUIs());
  const pending = usePendingModule(zone);
  const Pending = pending?.pendingPage;
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
  const DayLine = activeTabDef?.dayLine;
  // A zone made only of module sections has no page without them.
  if (tabs.length === 0 && pending)
    return (
      <div data-fill className="col-span-12 flex h-full min-h-0 flex-col gap-lg">
        <PageSurface>
          <ContentBoundary key={zone}>
            {Pending ? <Pending /> : <LoadingSkeleton label={m.tile_loading()} rows={2} />}
          </ContentBoundary>
        </PageSurface>
      </div>
    );
  if (tabs.length === 0) throw notFound();
  return (
    <div data-fill className="col-span-12 flex h-full min-h-0 flex-col gap-lg">
      <ZoneTabs
        dayLine={
          DayLine ? (
            <ContentBoundary key={`${zone}/${active}`}>
              <DayLine />
            </ContentBoundary>
          ) : undefined
        }
        always={always}
        fill={ownScroll}
        float={float}
        tabs={tabs.map(({ id, label, component: Content }) => ({
          id,
          label: label(),
          content: (
            <ContentBoundary key={`${zone}/${id}`}>
              <Content />
            </ContentBoundary>
          ),
        }))}
      />
    </div>
  );
}
