import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, useSubscription } from '@trpc/tanstack-react-query';
import type { AirPlayModuleDefinition } from '../../../../server/src/integrations/airplay/module.ts';
import { createModuleClient } from '../../lib/module-client.ts';
import { useConnectionLost } from '../../lib/trpc.ts';
import { copy } from './copy.ts';

const client = createModuleClient<AirPlayModuleDefinition>('airplay');

/** The receiver's pushed state and one toggle; the row and the deck tile share it, so they always agree. */
export function useAirPlay() {
  const trpc = createTRPCOptionsProxy<ReturnType<AirPlayModuleDefinition['create']>['router'], { keyPrefix: true }>({
    client,
    queryClient: useQueryClient(),
    keyPrefix: 'airplay',
  });
  const state = useSubscription(trpc.onState.subscriptionOptions());
  const start = useMutation(trpc.start.mutationOptions());
  const stop = useMutation(trpc.stop.mutationOptions());
  const running = state.data?.running;
  return {
    running,
    text: running ? copy.on : copy.off,
    pending: start.isPending || stop.isPending,
    error: start.isError || stop.isError,
    stale: useConnectionLost(),
    toggle: () => (running ? stop.mutateAsync() : start.mutateAsync()),
    loaded: state.data !== undefined,
  };
}
