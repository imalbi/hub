import type { ModuleUI } from '../../lib/module-ui.ts';
import { copy } from './copy.ts';
import { LightTile } from './light-tile.tsx';
import { LightsPanel } from './lights-panel.tsx';

/** The one ModuleUI both the example module and the owner's private wiring export. */
export const hueUI = {
  name: 'hue',
  copy,
  widgets: [{ id: 'lights', label: () => copy.title, sizes: ['small', 'medium'], component: LightsPanel }],
  // Dispositivi is where things connected to Hub live: the paired phone, now the light.
  places: [{ zone: 'devices', widget: 'lights', size: 'medium' }],
  deck: { id: 'lights', label: () => copy.title, tiles: [LightTile], page: 'desk' },
} satisfies ModuleUI;
