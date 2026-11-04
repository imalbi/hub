import type { ComponentType } from 'react';
import type { WidgetSize } from '../lib/widget-size.ts';
import { AudioWidget } from '../modules/audio/widget.tsx';
import { MediaWidget } from '../modules/media/widget.tsx';
import { PomodoroWidget } from '../modules/pomodoro/widget.tsx';
import { ServerWidget } from '../modules/system/widget.tsx';
import { m } from '../paraglide/messages.js';

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
  { id: 'audio', label: m.tile_audio_output, sizes: ['small', 'medium', 'wide'], component: AudioWidget },
];

export const defaultOverview: WidgetItem[] = [
  { widget: 'pomodoro', size: 'medium', x: 0, y: 0 },
  { widget: 'media', size: 'medium', x: 6, y: 0 },
  { widget: 'server', size: 'small', x: 0, y: 1 },
  { widget: 'audio', size: 'small', x: 3, y: 1 },
];
