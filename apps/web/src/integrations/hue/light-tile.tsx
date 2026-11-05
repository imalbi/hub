import { LightbulbIcon } from '@phosphor-icons/react';
import { Tile } from '../../components/tile.tsx';
import { copy } from './copy.ts';
import { describeLight, useHue } from './use-hue.ts';

/** One explicit power write per tap; dimmed and inert while the light or Hub is unreachable. */
export function LightTile() {
  const { state, setPower, connectionLost } = useHue();
  const light = state.data;
  const power = light?.availability === 'ready' && light.capabilities.power ? light.power : null;
  return (
    <Tile
      icon={LightbulbIcon}
      iconName="lightbulb"
      iconWeight={light?.power ? 'fill' : 'regular'}
      label={copy.title}
      state={describeLight(light, connectionLost)}
      pending={setPower.isPending}
      disabled={power === null}
      error={setPower.isError}
      stale={connectionLost || light?.availability === 'unavailable'}
      onPress={() => {
        if (power !== null) setPower.mutate({ on: !power });
      }}
    />
  );
}
