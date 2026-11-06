import { z } from 'zod';

/**
 * `validateSearch` of every zone route: the router runs a Standard Schema as it is. The router fails the whole route
 * on a validation issue, so a `tab` that is not a string (`?tab=3` is parsed as a number) is dropped, never rejected.
 * Pages with filters extend this schema.
 */
export const zoneSearch = z.object({ tab: z.string().optional().catch(undefined) });

/** The tab to show: the one in the URL when this page has it, the first otherwise (a stale link, a removed module). */
export function activeTab(ids: readonly string[], tab: string | undefined) {
  return tab !== undefined && ids.includes(tab) ? tab : ids[0];
}

/** What to write to `?tab=` for a choice: the first tab is the default, so it leaves the URL clean. */
export function tabParam(ids: readonly string[], id: string) {
  return id === ids[0] ? undefined : id;
}
