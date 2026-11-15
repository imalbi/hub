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
export type PageTab = { id: string; label: () => string; component: ComponentType; fill?: boolean; float?: boolean };
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
export type ModuleUI = {
  name: string;
  copy: Record<string, string>;
  /** Widgets are for Panoramica, the one board: it offers every widget of every module. */
  widgets?: ModuleWidget[];
  /** Short lines in Oggi, rendered in module order. Components may return null or link to a zone. */
  todayItems?: ComponentType | ComponentType[];
  /** The middle column of Oggi, bottom aligned between the date column and the weather: a stack of short cards. One per app (the post-its). */
  todayColumn?: ComponentType;
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
