import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { activeTab, tabParam } from '../lib/zone-search.ts';
import { m } from '../paraglide/messages.js';
import { TabBarRowSlot, TabBarSlot } from '../shell/header-slot.tsx';
import { PageSurface } from '../shell/page-surface.tsx';
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
  float = false,
}: {
  tabs: ZoneTab[];
  always?: boolean;
  fill?: boolean;
  float?: boolean;
}) {
  const id = useId();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [row, setRow] = useState<HTMLElement | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const navigate = useNavigate();
  const { tab } = useSearch({ strict: false });
  const ids = tabs.map((entry) => entry.id);
  const active = tabs.find((entry) => entry.id === activeTab(ids, typeof tab === 'string' ? tab : undefined));
  useLayoutEffect(() => {
    if (pendingFocus.current !== active?.id) return;
    document.getElementById(`${id}-tab-${pendingFocus.current}`)?.focus();
    pendingFocus.current = null;
  }, [active?.id, id]);
  if (!active) return null;
  // No bar: the surface starts at the top inset of the desk, with the content only.
  if (tabs.length === 1 && !always)
    return (
      <PageSurface fill={fill} float={float}>
        {active.content}
      </PageSurface>
    );
  return (
    <PageSurface
      fill={fill}
      float={float}
      scrollKey={active.id}
      role="tabpanel"
      id={`${id}-panel`}
      aria-labelledby={`${id}-tab-${active.id}`}
      bar={
        <div className="flex flex-col gap-lg">
          <div className="flex items-center gap-md">
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
                pendingFocus.current = document.activeElement?.getAttribute('role') === 'tab' ? next : null;
                void navigate({
                  to: '.',
                  search: (previous: Record<string, unknown>) => ({ ...previous, tab: tabParam(ids, next) }),
                  replace: true,
                });
              }}
            />
            <div ref={setSlot} className="flex flex-1 items-center gap-md" />
          </div>
          <div ref={setRow} className="empty:hidden" />
        </div>
      }
    >
      <TabBarSlot value={slot}>
        <TabBarRowSlot value={row}>{active.content}</TabBarRowSlot>
      </TabBarSlot>
    </PageSurface>
  );
}
