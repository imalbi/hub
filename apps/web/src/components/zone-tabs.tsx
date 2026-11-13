import { useId, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { activeTab, tabParam } from '../lib/zone-search.ts';
import { m } from '../paraglide/messages.js';
import { PageSurface, useInSurface } from '../shell/page-surface.tsx';
import { LiquidTabs } from './ui/liquid-tabs.tsx';

export type ZoneTab = { id: string; label: string; count?: number; content: ReactNode };

/**
 * The tabs of a zone page. The chosen tab lives in the URL (`?tab=`, see `lib/zone-search.ts`; the route needs
 * `validateSearch: zoneSearch`), so a reload or a link keeps it; a click replaces the history entry. The first tab is the
 * default and a page with one tab shows no bar at all.
 */
export function ZoneTabs({
  tabs,
  always = false,
  fill = false,
}: {
  tabs: ZoneTab[];
  always?: boolean;
  fill?: boolean;
}) {
  const id = useId();
  // A page component that brings its own tabs (the private Lavoro page) already sits in the zone's surface: its bar and panel stay inside it, one surface per page.
  const nested = useInSurface();
  const navigate = useNavigate();
  const { tab } = useSearch({ strict: false });
  const ids = tabs.map((entry) => entry.id);
  const active = tabs.find((entry) => entry.id === activeTab(ids, typeof tab === 'string' ? tab : undefined));
  if (!active) return null;
  if (tabs.length === 1 && !always && nested) return active.content;
  // No bar: an empty row keeps the surface where it is on every page and clear of the floating top-right pill.
  if (tabs.length === 1 && !always)
    return (
      <>
        <div aria-hidden className="h-touch shrink-0" />
        <PageSurface fill={fill}>{active.content}</PageSurface>
      </>
    );
  return (
    <>
      <LiquidTabs
        id={id}
        label={m.zone_tabs()}
        size="md"
        tabs={tabs.map(({ id: value, label, count }) => ({
          value,
          label,
          count,
          id: `${id}-tab-${value}`,
          panelId: `${id}-panel`,
        }))}
        value={active.id}
        onValueChange={(next) => {
          void navigate({
            to: '.',
            search: (previous: Record<string, unknown>) => ({ ...previous, tab: tabParam(ids, next) }),
            replace: true,
          });
        }}
      />
      {nested ? (
        <div
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${active.id}`}
          className={
            fill ? 'flex min-h-0 flex-1 flex-col' : 'relative min-h-0 flex-1 overflow-y-auto overscroll-contain'
          }
        >
          {active.content}
        </div>
      ) : (
        <PageSurface fill={fill} role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active.id}`}>
          {active.content}
        </PageSurface>
      )}
    </>
  );
}
