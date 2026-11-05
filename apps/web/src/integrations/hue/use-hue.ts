import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, useSubscription } from '@trpc/tanstack-react-query';
import type { HueModuleDefinition } from '../../../../server/src/integrations/hue/module.ts';
import { createModuleClient } from '../../lib/module-client.ts';
import { useConnectionLost } from '../../lib/trpc.ts';
import { copy } from './copy.ts';

const client = createModuleClient<HueModuleDefinition>('hue');

/** The one light: its pushed state, its two actions, and whether the page lost its connection to Hub. */
export function useHue() {
  const trpc = createTRPCOptionsProxy<ReturnType<HueModuleDefinition['create']>['router'], { keyPrefix: true }>({
    client,
    queryClient: useQueryClient(),
    keyPrefix: 'hue',
  });
  return {
    state: useSubscription(trpc.onState.subscriptionOptions()),
    setPower: useMutation(trpc.setPower.mutationOptions()),
    setBrightness: useMutation(trpc.setBrightness.mutationOptions()),
    connectionLost: useConnectionLost(),
  };
}

type Light = ReturnType<typeof useHue>['state']['data'];

/** One line for the panel and the tile. Bluetooth being out is not the same fact as Hub being out. */
export function describeLight(light: Light, connectionLost: boolean) {
  if (!light) return connectionLost ? copy.hubUnavailable : copy.loading;
  if (light.availability === 'connecting') return copy.connecting;
  if (light.availability === 'unavailable') return copy.bluetoothUnavailable;
  if (light.power === null) return copy.unknown;
  if (!light.power) return copy.off;
  return light.brightnessPercent === null ? copy.on : `${copy.on}, ${light.brightnessPercent}%`;
}
