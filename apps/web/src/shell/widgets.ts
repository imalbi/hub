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

/** Every widget Panoramica can show, built-in and from modules, with the sizes it has a layout for. */
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

/** What Panoramica shows until the owner rearranges it. */
export const defaultLayout: WidgetItem[] = [
  { widget: 'pomodoro', size: 'medium', x: 0, y: 0 },
  { widget: 'media', size: 'medium', x: 6, y: 0 },
  { widget: 'server', size: 'small', x: 0, y: 1 },
  { widget: 'audio', size: 'small', x: 3, y: 1 },
  { widget: 'news', size: 'medium', x: 6, y: 1 },
];

for (const module of moduleUIs) widgets.push(...(module.widgets ?? []));
