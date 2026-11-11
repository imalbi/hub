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
export type PageTab = { id: string; label: () => string; component: ComponentType; fill?: boolean };
/** A tab a module adds to a zone page, after the page's own tabs. */
export type ModuleSection = PageTab & { zone: string };
export type ModuleUI = {
  name: string;
  copy: Record<string, string>;
  /** Widgets are for Panoramica, the one board: it offers every widget of every module. */
  widgets?: ModuleWidget[];
  /** Short lines in Oggi, rendered in module order. Components may return null or link to a zone. */
  todayItems?: ComponentType | ComponentType[];
  /** A page of its own in the rail. It lays itself out, and uses `ZoneTabs` when it needs tabs. */
  zone?: { id: string; label: () => string; icon: Icon; page: ComponentType; fill?: boolean };
  /** `page` names an existing deck page to add the tiles to, instead of a page of their own. */
  deck?: { id: string; label: () => string; tiles: ComponentType[]; page?: string };
  /**
   * Tabs this module adds to zone pages, built-in or declared by another module, after the page's own tabs. A zone that
   * does not exist skips the section (logged once at startup).
   */
  sections?: ModuleSection[];
};
