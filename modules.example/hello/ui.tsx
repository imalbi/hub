import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, useSubscription } from '@trpc/tanstack-react-query';
import { HandWavingIcon } from '@phosphor-icons/react';
import type definition from './server.ts';
import { createModuleClient } from '../../apps/web/src/lib/module-client.ts';
import type { ModuleUI } from '../../apps/web/src/lib/module-ui.ts';
import { useConnectionLost } from '../../apps/web/src/lib/trpc.ts';
import { Panel } from '../../apps/web/src/components/panel.tsx';
import { RegistryButton } from '../../apps/web/src/components/registry-button.tsx';
import { Tile } from '../../apps/web/src/components/tile.tsx';

export const copy = {
  title: 'Esempio',
  greeting: 'Ciao dal modulo di esempio',
  action: 'Saluta',
  count: 'Saluti',
  loading: 'Caricamento',
  unavailable: 'Non disponibile',
};
const client = createModuleClient<typeof definition>('hello');
function useHello() {
  const trpc = createTRPCOptionsProxy<ReturnType<typeof definition.create>['router'], { keyPrefix: true }>({
    client,
    queryClient: useQueryClient(),
    keyPrefix: 'hello',
  });
  return {
    state: useSubscription(trpc.onState.subscriptionOptions()),
    greet: useMutation(trpc.greet.mutationOptions()),
  };
}
function HelloPanel() {
  const { state, greet } = useHello();
  return (
    <Panel title={copy.title} className="h-full">
      <p className="text-body">{state.data?.greeting ?? copy.loading}</p>
      <p className="text-display tabular-nums">{state.data?.count ?? 0}</p>
      <RegistryButton label={copy.action} action={() => greet.mutateAsync()} />
    </Panel>
  );
}
function HelloTile() {
  const { state, greet } = useHello();
  const stale = useConnectionLost();
  return (
    <Tile
      icon={HandWavingIcon}
      label={copy.title}
      state={state.data ? `${copy.count}: ${state.data.count}` : stale ? copy.unavailable : copy.loading}
      onPress={() => greet.mutate()}
      pending={greet.isPending}
      error={greet.isError}
      stale={stale}
    />
  );
}
export default {
  name: 'hello',
  copy,
  widgets: [{ id: 'hello', label: () => copy.title, sizes: ['medium', 'large'], component: HelloPanel }],
  zone: {
    id: 'hello',
    label: () => copy.title,
    icon: HandWavingIcon,
    layout: [{ widget: 'hello', size: 'medium', x: 0, y: 0 }],
  },
  deck: { id: 'hello', label: () => copy.title, tiles: [HelloTile] },
} satisfies ModuleUI;
