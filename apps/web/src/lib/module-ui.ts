import type { ComponentType } from 'react';
import type { Icon } from '@phosphor-icons/react';
import type { WidgetSize } from './widget-size.ts';

export type ModuleWidget = {
  id: string;
  label: () => string;
  sizes: readonly WidgetSize[];
  component: ComponentType<{ size: WidgetSize }>;
};
/** One tab of a zone page. Ids are unique within a page; the first tab is the default one. */
export type PageTab = {
  id: string;
  label: () => string;
  component: ComponentType;
  fill?: boolean;
  float?: boolean;
  dayLine?: ComponentType;
  fallback?: boolean;
};
/** A tab a module adds to a zone page, after the page's own tabs. */
export type ModuleSection = PageTab & { zone: string };
/** One thing a module has running now, shown in the "Attività in corso" ball and panel. `href` is the page that shows it. */
export type ModuleActivity = { id: string; label: string; detail: string; progress?: number; href: string };
/** A hook: a shell component calls it, so the ball knows whether anything runs without rendering the module's page. */
export type ModuleActivityHook = () => ModuleActivity | null;
/**
 * One dated thing a module shows on the Calendario page (read only). `time` is `HH:MM`; `label` is the muted first line
 * after the time (the kind's name when absent); `origin` is where it comes from; `href` is the page it opens.
 */
export type CalendarItem = {
  id: string;
  day: string;
  time?: string;
  title: string;
  kind: 'work' | 'note' | 'event' | 'study';
  label?: string;
  origin?: string;
  href?: string;
};
/** A hook the Calendario page calls with the days it shows (`YYYY-MM-DD`, inclusive); undefined while it loads. */
export type CalendarItemsHook = (range: { from: string; to: string }) => CalendarItem[] | undefined;
/** Which day an Oggi line or column is about: Esteso asks for tomorrow too. */
export type TodayDay = 'today' | 'tomorrow';
/**
 * One line of Oggi, drawn by `TodayRow`: the module's chip, the text (with an optional muted tail), and on the right a
 * value or "Apri". With `href` the whole row is one link; `dismiss` is for rows without a link (a link cannot hold a button).
 */
export type TodayLine = {
  id: string;
  chip?: string;
  text: string;
  muted?: string;
  value?: string;
  href?: string;
  dismiss?: { label: string; run: () => void };
};
/** A hook Oggi calls per day it shows; null or [] when the module has nothing to say about that day. */
export type TodayLinesHook = (day: TodayDay) => TodayLine[] | null;
/** How Oggi wants the post-its: a count, a titled column, titled cards two per row, or a bare stack (Esteso). */
export type TodayColumnVariant = 'count' | 'column' | 'grid' | 'stack';
/** One row of a record group in the palette: `href` is the page that shows the record, `detail` the muted line under the title. */
export type RecordRow = { id: string; title: string; detail: string; badges?: string[]; href: string };
/**
 * A module's records the palette can find (step 64). `search` is a plain async function that asks the module's own
 * server query (matching happens there); the palette keeps at most 3 rows, `total` is the number of matches before
 * the cut. `id` is permanent: later steps store it next to a record id, so name it for what it holds.
 */
export type RecordSource = {
  id: string;
  label: () => string;
  search: (query: string, signal: AbortSignal) => Promise<{ total: number; rows: RecordRow[] }>;
  get?: (id: string, signal: AbortSignal) => Promise<RecordRow | null>;
  /** Where "Vedi tutti" goes, with the query applied; absent when the page has no search of its own. */
  allHref?: (query: string) => string;
};
export type ModuleUI = {
  name: string;
  copy: Record<string, string>;
  useAvailable?: () => boolean;
  usePending?: () => boolean;
  pendingPage?: ComponentType;
  /** Widgets are for Panoramica, the one board: it offers every widget of every module. */
  widgets?: ModuleWidget[];
  /**
   * Lines in Oggi, in module order (step 66). Hooks, not components, so Oggi can count every line and cut them by
   * number ("e altre N") instead of clipping. Not named `use...` by the caller (see `activities`).
   */
  todayItems?: TodayLinesHook | TodayLinesHook[];
  /** Records the palette finds by typing, one group each, in module order while the module is on (step 64). */
  records?: RecordSource | RecordSource[];
  /** Optional next tracks below the large core media widget. */
  mediaUpcoming?: ComponentType;
  /** Optional content beside Oggi's clock; omitted without an active contributor. */
  todayHeader?: ComponentType<{ look: 'block' | 'caption'; align?: 'start' | 'end' }>;
  /** Additional configuration controls before the schema fields. */
  settingsHeader?: ComponentType<{ onSelect: (value: unknown) => void }>;
  /** The post-its of a day in Oggi, in the shape the size asks for. One per app (the post-its). */
  todayColumn?: ComponentType<{ day: TodayDay; variant: TodayColumnVariant; max: number }>;
  /** Read-only items for the Calendario page, in module order while the module is on. Not named `use...` by the caller (see `activities`). */
  calendarItems?: CalendarItemsHook | CalendarItemsHook[];
  /** A page of its own in the rail. It lays itself out, and uses `ZoneTabs` when it needs tabs. */
  zone?: { id: string; label: () => string; icon: Icon; page: ComponentType; fill?: boolean; ownTabs?: boolean };
  /**
   * Hooks that return what the module has running (a collection, a backfill), or null when nothing runs. The shell calls
   * them while the module is on; each non-null result is a row in the "Attività in corso" panel and counts in the ball.
   * A hook is called from a component of its own, so its list may change when a module is switched on or off.
   */
  activities?: ModuleActivityHook | ModuleActivityHook[];
  daySummary?: () => string | null;
  /**
   * One row in the Dispositivi list of this PC's external devices (AirPlay, a light, a monitor), rendered in module
   * order while the module is on. Each component is one row (`DeviceRow`) and may return null until it has data.
   */
  deviceRows?: ComponentType | ComponentType[];
  /**
   * One row in "Questo PC" of Sistema, after Webcam and the configured monitors and before Alimentazione, rendered in
   * module order while the module is on. Same shape and rule as `deviceRows`: each component is one `DeviceRow` (or
   * any element that fits a dashed list) and may return null until it has data, which leaves no gap.
   */
  systemRows?: ComponentType | ComponentType[];
  /**
   * `page` names an existing deck page to add the tiles to, instead of a page of their own. Tiles are appended; `at`
   * inserts them at that index instead, and then `page: 'desk'` means Scrivania itself, not its overflow page Scrivania 2.
   */
  deck?: { id: string; label: () => string; tiles: ComponentType[]; page?: string; at?: number };
  /**
   * Tabs this module adds to zone pages, built-in or declared by another module, after the page's own tabs. A zone that
   * does not exist skips the section (logged once at startup).
   */
  sections?: ModuleSection[];
};
