import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { getUntypedClient } from '@trpc/client';
import { LightningIcon } from '@phosphor-icons/react';
import { CommandPalette, type CommandItem } from '../components/ui/command-palette.tsx';
import { useTRPC, useTRPCClient } from '../lib/trpc.ts';
import { moduleUIs } from '../lib/modules.ts';
import { useZones, zones as allZones } from './zones.ts';
import { m } from '../paraglide/messages.js';
import { PaletteForm } from './palette-form.tsx';
import { paletteFields, type RegistryAction } from './palette-input.ts';

function recentPaths(): string[] {
  try {
    const paths: unknown = JSON.parse(localStorage.getItem('hub.palette.recent') ?? '[]');
    return Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string') : [];
  } catch {
    return [];
  }
}

function actionZone(path: string) {
  const name = path.split('.')[0];
  const module = moduleUIs.find((ui) => ui.name === name);
  const builtins: Record<string, string> = {
    audio: 'media',
    media: 'media',
    pomodoro: 'study',
    system: 'system',
    health: 'system',
    devices: 'devices',
    pairing: 'devices',
    theme: 'devices',
  };
  const zone =
    module?.zone ??
    allZones.find((item) => item.id === (module?.sections?.[0]?.zone ?? builtins[name ?? ''] ?? 'overview'));
  return zone?.label() ?? m.zone_overview();
}

/** The desk's command palette: the pill in the title row that grows into Vai a plus every registry action. */
export function DeskCommandPalette() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState(recentPaths);
  const zones = useZones();
  const registry = useQuery(trpc.registry.list.queryOptions(undefined, { enabled: open }));
  useEffect(() => {
    try {
      localStorage.setItem('hub.palette.recent', JSON.stringify(recent));
    } catch {
      /* Storage is optional. */
    }
  }, [recent]);

  async function run(action: RegistryAction, input?: unknown) {
    await getUntypedClient(client).mutation(action.path, input);
    setRecent((current) => [action.path, ...current.filter((path) => path !== action.path)]);
    // Registry actions also change query-only state such as widget layouts and paired devices.
    await queryClient.invalidateQueries();
  }

  const actions = (registry.data ?? []).toSorted((a, b) => {
    const first = recent.indexOf(a.path);
    const second = recent.indexOf(b.path);
    return (first < 0 ? recent.length : first) - (second < 0 ? recent.length : second);
  });

  const items: CommandItem[] = [
    ...zones.map((zone) => ({
      id: `goto:${zone.id}`,
      label: zone.label(),
      group: m.palette_goto(),
      icon: <zone.icon />,
      // The router navigates in place; a full page load would drop the live connection and every cache.
      onSelect: () => void navigate({ to: zone.path, params: zone.params }),
    })),
    ...actions.map((action): CommandItem => {
      const fields = paletteFields(action.schema, action.danger);
      // Danger, input and unsupported schemas open a page; a danger one only through the hold inside it.
      const needsPage = action.danger || fields === null || fields.length > 0;
      return {
        id: action.path,
        label: action.label,
        group: m.palette_actions(),
        icon: <LightningIcon />,
        keywords: [action.description],
        note: action.schema ? (fields === null ? m.palette_not_runnable() : m.palette_needs_input()) : undefined,
        meta: actionZone(action.path),
        ...(needsPage
          ? {
              // oxlint-disable-next-line react/no-unstable-nested-components -- `view` is called as a function by the palette, never mounted as a component, so PaletteForm keeps its identity.
              view: () => <PaletteForm action={action} run={(input) => run(action, input)} />,
            }
          : { onSelect: () => run(action) }),
      };
    }),
  ];

  return (
    <CommandPalette
      items={items}
      onOpenChange={setOpen}
      emptyText={(query) =>
        registry.isError ? m.palette_error() : registry.isPending ? m.palette_loading() : m.palette_empty({ query })
      }
      copy={{
        dialog: m.palette_title(),
        search: m.palette_search(),
        list: m.palette_title(),
        triggerLabel: m.palette_trigger(),
        triggerName: m.palette_open(),
        escape: m.palette_escape(),
        move: m.palette_move(),
        open: m.palette_open_hint(),
        back: m.palette_back(),
        pending: m.action_pending(),
        failed: m.palette_error(),
      }}
    />
  );
}
