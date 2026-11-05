import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getUntypedClient } from '@trpc/client';
import { Command } from 'cmdk';
import { LightningIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useTRPC, useTRPCClient } from '../lib/trpc.ts';
import { moduleUIs } from '../lib/modules.ts';
import { zones } from './zones.ts';
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
    module?.zone ?? zones.find((item) => item.id === (module?.places?.[0]?.zone ?? builtins[name ?? ''] ?? 'overview'));
  return zone?.label() ?? m.zone_overview();
}

function mountPalette(dialog: HTMLDialogElement | null) {
  if (!dialog) return undefined;
  dialog.showModal();
  return () => dialog.close();
}

export function DeskCommandPalette() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const session = useRef(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RegistryAction | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'error'>('idle');
  const [recent, setRecent] = useState(recentPaths);
  const registry = useQuery(trpc.registry.list.queryOptions(undefined, { enabled: open }));
  const onHotkey = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.repeat ||
      event.key.toLowerCase() !== 'k' ||
      !(event.ctrlKey || event.metaKey) ||
      event.altKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    session.current++;
    setSelected(null);
    setQuery('');
    setStatus('idle');
    setOpen((current) => !current);
  });
  useEffect(() => {
    document.addEventListener('keydown', onHotkey);
    return () => document.removeEventListener('keydown', onHotkey);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('hub.palette.recent', JSON.stringify(recent));
    } catch {
      /* Storage is optional. */
    }
  }, [recent]);
  function close() {
    session.current++;
    setOpen(false);
  }
  async function run(action: RegistryAction, input?: unknown) {
    await getUntypedClient(client).mutation(action.path, input);
    setRecent((current) => [action.path, ...current.filter((path) => path !== action.path)]);
    // Registry actions also change query-only state such as widget layouts and paired devices.
    await queryClient.invalidateQueries();
  }
  async function choose(action: RegistryAction) {
    if (status === 'pending') return;
    const fields = paletteFields(action.schema, action.danger);
    if (action.danger || fields === null || fields.length) {
      setSelected(action);
      return;
    }
    const requestSession = session.current;
    setStatus('pending');
    try {
      await run(action);
      if (session.current === requestSession) {
        close();
        setStatus('idle');
      }
    } catch {
      if (session.current === requestSession) setStatus('error');
    }
  }
  const actions = (registry.data ?? []).toSorted((a, b) => {
    const first = recent.indexOf(a.path);
    const second = recent.indexOf(b.path);
    return (first < 0 ? recent.length : first) - (second < 0 ? recent.length : second);
  });
  if (!open) return null;
  return (
    <dialog
      ref={mountPalette}
      aria-label={m.palette_title()}
      onCancel={close}
      onKeyDownCapture={(event) => {
        // HoldButton consumes Escape to cancel a hold; the palette must close as well.
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }}
      className="fixed inset-0 m-auto max-h-dvh w-sheet max-w-full overflow-hidden rounded-lg border border-border bg-surface p-0 text-foreground backdrop:bg-background/55"
    >
      {selected ? (
        <div className="max-h-dvh overflow-y-auto p-lg">
          <PaletteForm action={selected} run={(input) => run(selected, input)} />
        </div>
      ) : (
        <Command
          label={m.palette_search()}
          loop
          vimBindings={false}
          onKeyDownCapture={(event) => {
            if (status === 'pending' && event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          <div className="flex items-center gap-sm border-b border-border p-md">
            <MagnifyingGlassIcon
              aria-hidden="true"
              data-icon="magnifying-glass"
              className="size-icon shrink-0 text-muted-foreground"
            />
            <Command.Input
              onValueChange={setQuery}
              placeholder={m.palette_search()}
              className="min-h-touch min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground"
            />
            <span className="text-caption text-muted-foreground">{m.palette_escape()}</span>
          </div>
          <Command.List label={m.palette_title()} className="max-h-widget-row overflow-y-auto overscroll-contain p-xs">
            <Command.Empty asChild>
              {/* cmdk.Empty supplies role=presentation through its slot, so the explicit status must win. */}
              {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Preserve live status through cmdk's slot role override. */}
              <output role="status" className="block p-md text-body text-muted-foreground">
                {registry.isError
                  ? m.palette_error()
                  : registry.isPending
                    ? m.palette_loading()
                    : m.palette_empty({ query })}
              </output>
            </Command.Empty>
            {actions.map((action) => (
              <Command.Item
                key={action.path}
                value={action.path}
                keywords={[action.label, action.description]}
                disabled={status === 'pending'}
                onSelect={() => {
                  void choose(action);
                }}
                className="flex min-h-touch cursor-pointer items-center gap-sm rounded-md px-sm py-xs text-label aria-disabled:opacity-60 aria-selected:bg-muted"
              >
                <LightningIcon
                  aria-hidden="true"
                  data-icon="lightning"
                  className="size-icon shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1">
                  <span className="block">{action.label}</span>
                  {action.schema && (
                    <span className="block text-caption text-muted-foreground">
                      {paletteFields(action.schema, action.danger) === null
                        ? m.palette_not_runnable()
                        : m.palette_needs_input()}
                    </span>
                  )}
                </span>
                <span className="text-caption text-muted-foreground">{actionZone(action.path)}</span>
              </Command.Item>
            ))}
          </Command.List>
          <p aria-live="polite" className="block border-t border-border px-md py-sm text-caption text-muted-foreground">
            {status === 'pending'
              ? m.action_pending()
              : status === 'error'
                ? m.palette_error()
                : m.palette_keyboard_hint()}
          </p>
        </Command>
      )}
    </dialog>
  );
}
