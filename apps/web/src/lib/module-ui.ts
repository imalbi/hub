import type { ComponentType } from 'react';
import type { Icon } from '@phosphor-icons/react';
import type { WidgetSize } from './widget-size.ts';

export type ModuleWidget = {
  id: string;
  label: () => string;
  sizes: readonly WidgetSize[];
  component: ComponentType<{ size: WidgetSize }>;
};
export type ModuleUI = {
  name: string;
  copy: Record<string, string>;
  widgets?: ModuleWidget[];
  zone?: {
    id: string;
    label: () => string;
    icon: Icon;
    layout: Array<{ widget: string; size: WidgetSize; x: number; y: number }>;
    page?: ComponentType;
  };
  /** `page` names an existing deck page to add the tiles to, instead of a page of their own. */
  deck?: { id: string; label: () => string; tiles: ComponentType[]; page?: string };
  /**
   * Built-in zones a widget of this module joins (Panoramica takes every widget anyway), placed at the bottom of
   * the zone's default layout until the owner rearranges it.
   */
  places?: Array<{ zone: string; widget: string; size: WidgetSize }>;
};
