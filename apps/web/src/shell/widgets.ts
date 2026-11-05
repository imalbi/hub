import { moduleUIs } from '../lib/modules.ts';
import type { ComponentType } from 'react';
import type { WidgetSize } from '../lib/widget-size.ts';
import { AudioWidget } from '../modules/audio/widget.tsx';
import { DevicesWidget } from '../modules/devices/widget.tsx';
import { MediaWidget } from '../modules/media/widget.tsx';
import { NewsWidget } from '../modules/news/widget.tsx';
import { PomodoroWidget } from '../modules/pomodoro/widget.tsx';
import { ControlsWidget } from '../modules/system/controls-widget.tsx';
import { PowerWidget } from '../modules/system/power-widget.tsx';
import { ServerWidget } from '../modules/system/widget.tsx';
import { m } from '../paraglide/messages.js';
import { ThemeWidget } from '../theme/widget.tsx';

export type WidgetItem = { widget: string; size: WidgetSize; x: number; y: number };

/** Every widget the board can show, with the sizes it has a layout for. Step 11 lets modules add to this list. */
export const widgets: Array<{
  id: string;
  label: () => string;
  sizes: readonly WidgetSize[];
  component: ComponentType<{ size: WidgetSize }>;
}> = [
  { id: 'pomodoro', label: m.pomodoro_title, sizes: ['small', 'medium', 'large', 'wide'], component: PomodoroWidget },
  { id: 'media', label: m.tile_media, sizes: ['small', 'medium', 'large', 'wide'], component: MediaWidget },
  { id: 'server', label: m.server_panel_title, sizes: ['small', 'medium', 'wide'], component: ServerWidget },
  { id: 'news', label: m.news_title, sizes: ['small', 'medium'], component: NewsWidget },
  { id: 'controls', label: m.system_controls, sizes: ['wide', 'large'], component: ControlsWidget },
  { id: 'power', label: m.power_title, sizes: ['small', 'medium'], component: PowerWidget },
  { id: 'audio', label: m.tile_audio_output, sizes: ['small', 'medium', 'wide'], component: AudioWidget },
  // Lists that grow scroll inside their cell, so they only come in sizes tall enough to show a few rows.
  { id: 'devices', label: m.devices_title, sizes: ['large', 'full'], component: DevicesWidget },
  { id: 'theme', label: m.theme_title, sizes: ['large', 'full'], component: ThemeWidget },
];

export type ZoneId = string;

/** Which widgets a zone may hold: Panoramica is the home screen and takes them all, a zone only its own domain's. */
export const zoneWidgets: Record<ZoneId, readonly string[] | 'all'> = {
  overview: 'all',
  study: ['pomodoro'],
  media: ['audio'],
  system: ['controls', 'power', 'server'],
  devices: ['devices', 'theme'],
};

/** What each zone shows until the owner rearranges it. */
export const defaultLayouts: Record<ZoneId, WidgetItem[]> = {
  overview: [
    { widget: 'pomodoro', size: 'medium', x: 0, y: 0 },
    { widget: 'media', size: 'medium', x: 6, y: 0 },
    { widget: 'server', size: 'small', x: 0, y: 1 },
    { widget: 'audio', size: 'small', x: 3, y: 1 },
    { widget: 'news', size: 'medium', x: 6, y: 1 },
  ],
  study: [{ widget: 'pomodoro', size: 'large', x: 0, y: 0 }],
  media: [{ widget: 'audio', size: 'medium', x: 0, y: 0 }],
  system: [
    { widget: 'controls', size: 'wide', x: 0, y: 0 },
    { widget: 'power', size: 'small', x: 0, y: 1 },
    { widget: 'server', size: 'small', x: 3, y: 1 },
  ],
  devices: [
    { widget: 'devices', size: 'large', x: 0, y: 0 },
    { widget: 'theme', size: 'large', x: 6, y: 0 },
  ],
};

for (const module of moduleUIs) {
  widgets.push(...(module.widgets ?? []));
  // Below the built-in rows; the board's vertical compaction closes any gap.
  if (module.overview) defaultLayouts.overview?.push({ ...module.overview, x: 0, y: 2 });
  if (module.zone) {
    zoneWidgets[module.zone.id] = (module.widgets ?? []).map((widget) => widget.id);
    defaultLayouts[module.zone.id] = module.zone.layout;
  }
}
