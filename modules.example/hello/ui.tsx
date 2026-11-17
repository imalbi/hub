import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createTRPCOptionsProxy, useSubscription } from '@trpc/tanstack-react-query';
import { HandWavingIcon } from '@phosphor-icons/react';
import type definition from './server.ts';
import { createModuleClient } from '../../apps/web/src/lib/module-client.ts';
import type { ModuleUI, RecordSource, TodayDay, TodayLine } from '../../apps/web/src/lib/module-ui.ts';
import { useConnectionLost } from '../../apps/web/src/lib/trpc.ts';
import { DeviceRow } from '../../apps/web/src/components/device-row.tsx';
import { PageGrid } from '../../apps/web/src/components/page-grid.tsx';
import { Panel } from '../../apps/web/src/components/panel.tsx';
import { RegistryButton } from '../../apps/web/src/components/registry-button.tsx';
import { Tile } from '../../apps/web/src/components/tile.tsx';
import { RecordNotes } from '../../apps/web/src/components/record-notes.tsx';
import { setCurrentRecord } from '../../apps/web/src/lib/current-record.ts';

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
function HelloPage() {
  const record = { source: 'hello-greetings', id: '1', title: copy.greeting };
  useEffect(() => {
    setCurrentRecord({ source: 'hello-greetings', id: '1', title: copy.greeting });
    return () => setCurrentRecord(null);
  }, []);
  return (
    <PageGrid>
      <div className="col-span-6 flex flex-col gap-lg">
        <HelloPanel />
        <RecordNotes record={record} />
      </div>
    </PageGrid>
  );
}
function HelloRow() {
  const { state, greet } = useHello();
  return (
    <DeviceRow label={copy.title} state={`${copy.count}: ${state.data?.count ?? 0}`}>
      <RegistryButton secondary label={copy.action} action={() => greet.mutateAsync()} />
    </DeviceRow>
  );
}
// An Oggi line (step 66): a hook that returns rows, so Oggi can count and cut them. Nothing for tomorrow.
function useHelloToday(day: TodayDay): TodayLine[] | null {
  return day === 'today' ? [{ id: 'hello', chip: copy.title, text: copy.greeting, href: '/desk/hello' }] : null;
}
// The palette finds greetings (step 64): the module's own typed client, a plain async function.
const greetings: RecordSource = {
  id: 'hello-greetings',
  label: () => 'Saluti',
  get: async (id, signal) => {
    const row = await client.getRecord.query({ id }, { signal });
    return row ? { ...row, detail: copy.title, href: '/desk/hello' } : null;
  },
  search: async (query, signal) => {
    const { total, rows } = await client.searchRecords.query({ query }, { signal });
    return { total, rows: rows.map((row) => ({ ...row, detail: copy.title, href: '/desk/hello' })) };
  },
};
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
  todayItems: useHelloToday,
  records: greetings,
  deviceRows: HelloRow,
  // The same row again in Sistema, after Webcam and the monitors, so the slot has an example.
  systemRows: HelloRow,
  widgets: [{ id: 'hello', label: () => copy.title, sizes: ['medium', 'large'], component: HelloPanel }],
  zone: { id: 'hello', label: () => copy.title, icon: HandWavingIcon, page: HelloPage },
  // The Lavoro zone has no content of its own: it appears in the rail because this module adds a section to it.
  // The same page as a second tab of Dispositivi: a section can go to any zone page, built-in or not.
  sections: [
    { zone: 'work', id: 'hello', label: () => copy.title, component: HelloPage },
    { zone: 'devices', id: 'hello', label: () => copy.title, component: HelloPage },
  ],
  deck: { id: 'hello', label: () => copy.title, tiles: [HelloTile] },
} satisfies ModuleUI;
