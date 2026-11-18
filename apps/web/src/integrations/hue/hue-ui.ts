import type { ModuleUI } from '../../lib/module-ui.ts';
import { copy } from './copy.ts';
import { LightTile } from './light-tile.tsx';
import { LightRow } from './light-row.tsx';
import { LightsPanel } from './lights-panel.tsx';

/** The one ModuleUI both the example module and the owner's private wiring export. */
export const hueUI = {
  name: 'hue',
  copy,
  widgets: [{ id: 'lights', label: () => copy.title, sizes: ['small', 'medium'], component: LightsPanel }],
  // Dispositivi lists what is connected to this PC; the light is one of its rows.
  deviceRows: LightRow,
  deck: { id: 'lights', label: () => copy.title, tiles: [LightTile], page: 'system', at: 1 },
} satisfies ModuleUI;
