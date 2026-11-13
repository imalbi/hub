import { AirplayIcon } from '@phosphor-icons/react';
import { Tile } from '../../components/tile.tsx';
import { copy } from './copy.ts';
import { useAirPlay } from './use-airplay.ts';

export function AirPlayTile() {
  const airplay = useAirPlay();
  if (!airplay.loaded) return null;
  return (
    <Tile
      icon={AirplayIcon}
      label={copy.title}
      state={airplay.text}
      pending={airplay.pending}
      error={airplay.error}
      stale={airplay.stale}
      disabled={airplay.stale}
      onPress={() => void airplay.toggle().catch(() => undefined)}
    />
  );
}
