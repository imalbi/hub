import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
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
    icon: LucideIcon;
    layout: Array<{ widget: string; size: WidgetSize; x: number; y: number }>;
    page?: ComponentType;
  };
  deck?: { id: string; label: () => string; tiles: ComponentType[] };
};
