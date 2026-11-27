import { useIsOn } from '../lib/enabled-modules.ts';
import { moduleUIs } from '../lib/modules.ts';
import type { ComponentType } from 'react';
import type { WidgetSize } from '../lib/widget-size.ts';
import { AudioWidget } from '../modules/audio/widget.tsx';
import { DevicesWidget } from '../modules/devices/widget.tsx';
import { MediaWidget } from '../modules/media/widget.tsx';
import { PomodoroWidget } from '../modules/pomodoro/widget.tsx';
import { ControlsWidget } from '../modules/system/controls-widget.tsx';
import { PowerWidget } from '../modules/system/power-widget.tsx';
import { ServerWidget } from '../modules/system/widget.tsx';
import { m } from '../paraglide/messages.js';
import { BriefWidget } from './brief-widget.tsx';
import { TodayWidget } from './today-widget.tsx';
import { ThemeWidget } from '../theme/widget.tsx';

export type WidgetItem = { widget: string; size: WidgetSize; x: number; y: number };

/** Every widget Panoramica can show, built-in and from modules, with the sizes it has a layout for. */
export const widgets: Array<{
  id: string;
  label: () => string;
  sizes: readonly WidgetSize[];
  component: ComponentType<{ size: WidgetSize }>;
}> = [
  { id: 'brief', label: m.brief_title, sizes: ['medium', 'large', 'wide'], component: BriefWidget },
  { id: 'today', label: m.today_title, sizes: ['medium', 'large', 'wide', 'full'], component: TodayWidget },
  { id: 'pomodoro', label: m.pomodoro_title, sizes: ['small', 'medium', 'large', 'wide'], component: PomodoroWidget },
  { id: 'media', label: m.tile_media, sizes: ['small', 'medium', 'large', 'wide'], component: MediaWidget },
  { id: 'server', label: m.server_panel_title, sizes: ['small', 'medium', 'wide'], component: ServerWidget },
  { id: 'controls', label: m.system_controls, sizes: ['wide', 'large'], component: ControlsWidget },
  { id: 'power', label: m.power_title, sizes: ['small', 'medium'], component: PowerWidget },
  { id: 'audio', label: m.tile_audio_output, sizes: ['small', 'medium', 'wide'], component: AudioWidget },
  // Lists that grow scroll inside their cell, so they only come in sizes tall enough to show a few rows.
  { id: 'devices', label: m.devices_title, sizes: ['small', 'large'], component: DevicesWidget },
  { id: 'theme', label: m.theme_title, sizes: ['large', 'full'], component: ThemeWidget },
];

/** What Panoramica shows until the owner rearranges it (board P1, public widgets only). */
export const defaultLayout: WidgetItem[] = [
  { widget: 'today', size: 'wide', x: 0, y: 0 },
  { widget: 'pomodoro', size: 'small', x: 6, y: 1 },
  { widget: 'audio', size: 'small', x: 9, y: 1 },
  { widget: 'media', size: 'medium', x: 0, y: 2 },
  { widget: 'calendar', size: 'large', x: 0, y: 3 },
  { widget: 'devices', size: 'large', x: 6, y: 3 },
];

// The module each widget belongs to, so a module that is off takes its widgets out of the offer and the board.
const widgetOwner = new Map<string, string>(
  Object.entries({
    pomodoro: 'pomodoro',
    media: 'media',
    server: 'health',
    controls: 'system',
    power: 'system',
    audio: 'audio',
    devices: 'devices',
    theme: 'theme',
  }),
);
for (const module of moduleUIs)
  for (const widget of module.widgets ?? []) {
    widgets.push(widget);
    widgetOwner.set(widget.id, module.name);
  }

/** The widgets whose module is on. A saved layout keeps the ones that are off, so switching a module back on restores them. */
export function useWidgets() {
  const isOn = useIsOn();
  return widgets.filter((widget) => !widgetOwner.has(widget.id) || isOn(widgetOwner.get(widget.id) ?? ''));
}
