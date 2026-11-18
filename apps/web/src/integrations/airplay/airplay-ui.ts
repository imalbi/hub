import type { ModuleUI } from '../../lib/module-ui.ts';
import { AirPlayRow } from './airplay-row.tsx';
import { AirPlayTile } from './airplay-tile.tsx';
import { copy } from './copy.ts';

/** The one ModuleUI both the example module and the owner's private wiring export. */
export const airplayUI = {
  name: 'airplay',
  copy,
  deviceRows: AirPlayRow,
  deck: { id: 'airplay', label: () => copy.title, tiles: [AirPlayTile], page: 'desk', at: 8 },
} satisfies ModuleUI;
