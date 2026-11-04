import type { ComponentType } from 'react';
import { AudioOutputTile } from '../modules/audio/deck-tile.tsx';
import { MediaTile } from '../modules/media/deck-tile.tsx';
import { PomodoroTile } from '../modules/pomodoro/deck-tile.tsx';
import {
  CommunicationTile,
  LockTile,
  MusicAppTile,
  PowerOffTile,
  PowerTile,
  RebootTile,
  SuspendTile,
} from '../modules/system/deck-tile.tsx';
import { DeckThemeList } from '../theme/deck-theme-list.tsx';
import { m } from '../paraglide/messages.js';

type Page = {
  id: string;
  label: () => string;
  /** At most 12: the grid is 3 columns by 4 rows and the deck never scrolls vertically. */
  tiles: ComponentType[];
  /** Below the tiles, for a page that needs more than buttons. */
  extra?: ComponentType;
};

/** The deck's pages, mirroring the desk zones, in swipe order. */
export const pages: Page[] = [
  { id: 'desk', label: m.page_desk, tiles: [AudioOutputTile, MediaTile, PomodoroTile] },
  { id: 'study', label: m.zone_study, tiles: [PomodoroTile] },
  {
    id: 'system',
    label: m.zone_system,
    tiles: [LockTile, CommunicationTile, MusicAppTile, PowerTile, SuspendTile, RebootTile, PowerOffTile],
    extra: DeckThemeList,
  },
];
