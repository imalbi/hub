import { notFound, useSearch } from '@tanstack/react-router';
import { ZoneTabs } from '../components/zone-tabs.tsx';
import { useLiveModuleUIs } from '../lib/enabled-modules.ts';
import type { PageTab } from '../lib/module-ui.ts';
import { pageTabs } from './zone-sections.ts';
import { useSitesConfigured } from '../modules/sites/sites.tsx';
import { m } from '../paraglide/messages.js';
import { activeTab } from '../lib/zone-search.ts';

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
  const ownScroll = tabs.find(({ id }) => id === active)?.fill;
  // A zone made only of module sections has no page without them.
  if (tabs.length === 0 && zone === 'work' && sites.isPending) return <p>{m.tile_loading()}</p>;
  if (tabs.length === 0) throw notFound();
  return (
    <div data-fill className="col-span-12 flex h-full min-h-0 flex-col gap-lg">
      <ZoneTabs
        always={always}
        fill={ownScroll}
        tabs={tabs.map(({ id, label, component: Content }) => ({ id, label: label(), content: <Content /> }))}
      />
    </div>
  );
}
