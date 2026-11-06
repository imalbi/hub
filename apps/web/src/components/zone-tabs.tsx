import { useId, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { activeTab, tabParam } from '../lib/zone-search.ts';
import { m } from '../paraglide/messages.js';
import { Tabs } from './ui/tabs.tsx';

export type ZoneTab = { id: string; label: string; count?: number; content: ReactNode };

/**
 * The tabs of a zone page. The chosen tab lives in the URL (`?tab=`, see `lib/zone-search.ts`; the route needs
 * `validateSearch: zoneSearch`), so a reload or a link keeps it; a click replaces the history entry. The first tab is the
 * default and a page with one tab shows no bar at all.
 */
export function ZoneTabs({ tabs }: { tabs: ZoneTab[] }) {
  const id = useId();
  const navigate = useNavigate();
  const { tab } = useSearch({ strict: false });
  const ids = tabs.map((entry) => entry.id);
  const active = tabs.find((entry) => entry.id === activeTab(ids, tab));
  if (!active) return null;
  if (tabs.length === 1) return active.content;
  return (
    <>
      <Tabs
        id={id}
        label={m.zone_tabs()}
        items={tabs.map(({ id: value, label, count }) => ({ value, label, count }))}
        value={active.id}
        onValueChange={(next) => {
          void navigate({ to: '.', search: (previous) => ({ ...previous, tab: tabParam(ids, next) }), replace: true });
        }}
      />
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active.id}`}>
        {active.content}
      </div>
    </>
  );
}
