import { useIsOn } from '../lib/enabled-modules.ts';
import { moduleUIs } from '../lib/modules.ts';
import type { ComponentType } from 'react';
import { AudioOutputTile, VolumeDownTile, VolumeUpTile, MicMuteTile } from '../modules/audio/deck-tile.tsx';
import { MediaTile, NextTile } from '../modules/media/deck-tile.tsx';
import { NewsTile } from '../modules/news/deck-tile.tsx';
import { PomodoroTile } from '../modules/pomodoro/deck-tile.tsx';
import {
  AirPlayTile,
  HubTile,
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
  {
    id: 'desk',
    label: m.page_desk,
    tiles: [
      HubTile,
      CommunicationTile,
      MusicAppTile,
      AudioOutputTile,
      VolumeDownTile,
      VolumeUpTile,
      MicMuteTile,
      MediaTile,
      NextTile,
      LockTile,
      AirPlayTile,
      PomodoroTile,
    ],
  },
  { id: 'desk-more', label: m.page_desk_more, tiles: [NewsTile] },
  { id: 'study', label: m.zone_study, tiles: [PomodoroTile] },
  {
    id: 'system',
    label: m.zone_system,
    tiles: [LockTile, CommunicationTile, MusicAppTile, PowerTile, SuspendTile, RebootTile, PowerOffTile],
    extra: DeckThemeList,
  },
];

// The module each tile belongs to, so a module that is off takes its tiles off the deck.
const tileOwner = new Map<ComponentType, string>([
  ...[AudioOutputTile, VolumeDownTile, VolumeUpTile, MicMuteTile].map((tile) => [tile, 'audio'] as const),
  ...[MediaTile, NextTile].map((tile) => [tile, 'media'] as const),
  [NewsTile, 'news'],
  [PomodoroTile, 'pomodoro'],
  [AirPlayTile, 'airplay'],
  ...[HubTile, CommunicationTile, LockTile, MusicAppTile, PowerOffTile, PowerTile, RebootTile, SuspendTile].map(
    (tile) => [tile, 'system'] as const,
  ),
]);

for (const module of moduleUIs) {
  const { deck } = module;
  if (!deck) continue;
  for (const tile of deck.tiles) tileOwner.set(tile, module.name);
  const target = pages.find((page) => page.id === (deck.page === 'desk' ? 'desk-more' : deck.page));
  if (target) target.tiles.push(...deck.tiles);
  else pages.push(deck);
}

/** The deck's pages with the tiles of modules that are off left out; a page left with nothing to show is dropped. */
export function useDeckPages() {
  const isOn = useIsOn();
  return pages
    .map((page) => ({ ...page, tiles: page.tiles.filter((tile) => isOn(tileOwner.get(tile) ?? '')) }))
    .filter((page) => page.tiles.length > 0 || page.extra);
}
