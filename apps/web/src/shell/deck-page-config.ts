import { useIsOn } from '../lib/enabled-modules.ts';
import { moduleUIs } from '../lib/modules.ts';
import type { ComponentType } from 'react';
import { AudioOutputTile, VolumeDownTile, VolumeUpTile, MicMuteTile } from '../modules/audio/deck-tile.tsx';
import { NewsTile } from '../modules/news/deck-tile.tsx';
import { MailTile } from '../modules/mail/deck-tile.tsx';
import { PomodoroTile } from '../modules/pomodoro/deck-tile.tsx';
import {
  HubTile,
  CommunicationTile,
  LockTile,
  MusicAppTile,
  PowerOffTile,
  PowerTile,
  RebootTile,
  SuspendTile,
} from '../modules/system/deck-tile.tsx';
import { MonitorTiles } from '../modules/system/monitor-rows.tsx';
import { DeckThemeList } from '../theme/deck-theme-list.tsx';
import { m } from '../paraglide/messages.js';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useTRPC } from '../lib/trpc.ts';
import { placeDeckTiles } from './pages.ts';

type Page = {
  id: string;
  label: () => string;
  /** At most 12: the grid is 3 columns by 4 rows and the deck never scrolls vertically. */
  tiles: ComponentType[];
  /** Below the tiles, for a page that needs more than buttons. */
  extra?: ComponentType;
};

/** The deck's pages, mirroring the desk zones, in swipe order. */
const pages: Page[] = [
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
      PomodoroTile,
      MailTile,
      NewsTile,
      LockTile,
    ],
  },
  {
    id: 'system',
    label: m.zone_system,
    tiles: [MonitorTiles, PowerTile, SuspendTile, RebootTile, PowerOffTile],
    extra: DeckThemeList,
  },
];

// Sistema's holds start their own row and stay last (board D1): module tiles go before them.
const holds: ComponentType[] = [SuspendTile, RebootTile, PowerOffTile];

// The module each tile belongs to, so a module that is off takes its tiles off the deck.
const tileOwner = new Map<ComponentType, string>([
  ...[AudioOutputTile, VolumeDownTile, VolumeUpTile, MicMuteTile].map((tile) => [tile, 'audio'] as const),
  [NewsTile, 'news'],
  [MailTile, 'mail'],
  [PomodoroTile, 'pomodoro'],
  ...[
    HubTile,
    CommunicationTile,
    LockTile,
    MonitorTiles,
    MusicAppTile,
    PowerOffTile,
    PowerTile,
    RebootTile,
    SuspendTile,
  ].map((tile) => [tile, 'system'] as const),
]);

for (const module of moduleUIs) {
  for (const tile of module.deck?.tiles ?? []) tileOwner.set(tile, module.name);
}

/** The deck's pages with the tiles of modules that are off left out; a page left with nothing to show is dropped. */
export function useDeckPages() {
  const isOn = useIsOn();
  const trpc = useTRPC();
  const monitors = useSubscription(trpc.system.onMonitors.subscriptionOptions(undefined, { enabled: isOn('system') }));
  let result = pages.map((page) => ({ ...page, tiles: [...page.tiles] }));
  for (const module of moduleUIs) {
    const { deck } = module;
    if (!deck || !isOn(module.name) || deck.at === undefined) continue;
    const target = result.find((page) => page.id === deck.page);
    if (target) target.tiles.splice(deck.at, 0, ...deck.tiles);
    else result.push(deck);
  }
  let counted: (Page & { count: number; tail?: number })[] = result.map((page) => {
    const tiles = page.tiles.filter((tile) => isOn(tileOwner.get(tile) ?? ''));
    return {
      ...page,
      tiles,
      tail: tiles.filter((tile) => holds.includes(tile)).length,
      count: tiles.reduce((count, tile) => count + (tile === MonitorTiles ? (monitors.data?.length ?? 0) : 1), 0),
    };
  });
  for (const module of moduleUIs) {
    if (module.deck && module.deck.at === undefined && isOn(module.name)) {
      counted = placeDeckTiles(counted, module.deck);
    }
  }
  return counted.filter((page) => page.tiles.length > 0 || page.extra);
}
