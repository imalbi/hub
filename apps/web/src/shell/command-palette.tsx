import { useEffect, useState } from 'react';
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { getUntypedClient } from '@trpc/client';
import { LightningIcon } from '@phosphor-icons/react';
import { CommandPalette, type CommandItem } from '../components/ui/command-palette.tsx';
import { useTRPC, useTRPCClient } from '../lib/trpc.ts';
import { useLiveModuleUIs } from '../lib/enabled-modules.ts';
import { moduleUIs } from '../lib/modules.ts';
import { useZones, zoneAt, zones as allZones } from './zones.ts';
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

// Records are asked for from this many characters on, after this long without a key press (step 64).
const RECORD_MIN = 2;
const RECORD_DELAY = 150;
// The palette keeps this many rows of a source, whatever it returns.
const RECORD_ROWS = 3;

/**
 * Record groups for a query: one request per source of the live modules, in parallel. The key holds the trimmed query,
 * so an answer for an older one lands in another cache entry and never in the list; TanStack aborts the request that
 * lost its observer (the `signal`), and `keepPreviousData` keeps the last rows on screen between two keys. A source
 * that fails has no data and shows nothing.
 */
function useRecordItems(query: string, open: boolean): CommandItem[] {
  const router = useRouter();
  const zones = useZones();
  const sources = useLiveModuleUIs().flatMap((ui) => [ui.records ?? []].flat());
  const trimmed = query.trim();
  const [asked, setAsked] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setAsked(trimmed), trimmed.length < RECORD_MIN ? 0 : RECORD_DELAY);
    return () => window.clearTimeout(timer);
  }, [trimmed]);
  const answers = useQueries({
    queries: sources.map((source) => ({
      queryKey: ['palette-records', source.id, asked],
      queryFn: ({ signal }: { signal: AbortSignal }) => source.search(asked, signal),
      enabled: open && asked.length >= RECORD_MIN,
      retry: false,
      placeholderData: keepPreviousData,
    })),
  });
  if (trimmed.length < RECORD_MIN) return [];
  return sources.flatMap((source, index) => {
    const answer = answers[index]?.data;
    if (!answer?.rows.length) return [];
    const allHref = source.allHref?.(trimmed);
    const zone = allHref ? zoneAt(allHref.split('?')[0] ?? '', zones)?.label() : undefined;
    const aside: CommandItem['groupAside'] = {
      text: String(answer.total),
      ...(allHref && zone && answer.total > RECORD_ROWS
        ? { link: { label: m.palette_all_in({ zone }), onSelect: () => router.history.push(allHref) } }
        : {}),
    };
    return answer.rows.slice(0, RECORD_ROWS).map((row): CommandItem => ({
      id: `record:${source.id}:${row.id}`,
      label: row.title,
      detail: row.detail,
      badges: row.badges,
      group: source.label(),
      always: true,
      groupAside: aside,
      onSelect: () => router.history.push(row.href),
    }));
  });
}

/** The desk's command palette: the magnifier at the top of the rail, which grows into Vai a plus every registry action. */
export function DeskCommandPalette() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const records = useRecordItems(query, open);
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

  const actions = (registry.data ?? [])
    // An action whose schema the palette cannot draw has no way to run from here: it stays out of the list.
    .filter((action) => action.kind === 'mutation' && paletteFields(action.schema, action.danger) !== null)
    .toSorted((a, b) => {
      const first = recent.indexOf(a.path);
      const second = recent.indexOf(b.path);
      return (first < 0 ? recent.length : first) - (second < 0 ? recent.length : second);
    });

  // The one place that orders the groups: records, Vai a, Azioni (the palette keeps the order of first appearance).
  const items: CommandItem[] = [
    ...records,
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
      // Danger and input open a page; a danger one only through the hold inside it.
      const needsPage = action.danger || (fields?.length ?? 0) > 0;
      return {
        id: action.path,
        label: action.label,
        group: m.palette_actions(),
        icon: <LightningIcon />,
        keywords: [action.description],
        note: action.schema ? m.palette_needs_input() : undefined,
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
      trigger="rail"
      items={items}
      onOpenChange={setOpen}
      onQueryChange={setQuery}
      emptyGroup={{ heading: m.palette_actions(), text: (typed) => m.palette_no_actions({ query: typed }) }}
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
