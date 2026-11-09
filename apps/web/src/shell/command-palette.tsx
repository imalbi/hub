import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { getUntypedClient } from '@trpc/client';
import { Command } from 'cmdk';
import { ArrowLeftIcon, LightningIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react';
import { Kbd } from '../components/ui/kbd.tsx';
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
    module?.zone ??
    zones.find((item) => item.id === (module?.sections?.[0]?.zone ?? builtins[name ?? ''] ?? 'overview'));
  return zone?.label() ?? m.zone_overview();
}

const BUTTON_ID = 'palette-button';

const groupClass =
  '[&_[cmdk-group-heading]]:px-sm [&_[cmdk-group-heading]]:pb-2xs [&_[cmdk-group-heading]]:pt-xs [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground';
const itemClass =
  'flex min-h-touch cursor-pointer items-center gap-sm rounded-lg px-sm text-label text-foreground select-none aria-disabled:opacity-50 aria-selected:bg-muted';

const PALETTE_TRANSITION: Transition = {
  duration: 0.38,
  ease: [0.22, 1, 0.36, 1],
};

export function DeskCommandPalette() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const session = useRef(0);
  const openerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RegistryAction | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'error'>('idle');
  const [recent, setRecent] = useState(recentPaths);
  const registry = useQuery(trpc.registry.list.queryOptions(undefined, { enabled: open }));
  function toggle() {
    session.current++;
    setSelected(null);
    setQuery('');
    setStatus('idle');
    if (!open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    setOpen((current) => !current);
  }
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
    toggle();
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
  function isReducedMotion() {
    return (
      (reduced ?? false) ||
      (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    );
  }

  function close() {
    session.current++;
    if (!isReducedMotion() && dialogRef.current?.open) {
      dialogRef.current.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 380,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        pseudoElement: '::backdrop',
      });
      dialogRef.current.animate([{ opacity: 1 }, { opacity: 1 }], {
        duration: 380,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      });
    }
    setOpen(false);
  }

  function handleExitComplete() {
    if (openerRef.current?.id === BUTTON_ID) {
      document.getElementById(BUTTON_ID)?.focus();
    } else if (openerRef.current && openerRef.current !== document.body && openerRef.current.isConnected) {
      openerRef.current.focus();
    }
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

  return (
    <>
      <AnimatePresence onExitComplete={handleExitComplete}>
        {!open && (
          <motion.button
            key="palette-button"
            type="button"
            id={BUTTON_ID}
            layoutId={reduced ? undefined : 'palette-pill'}
            transition={PALETTE_TRANSITION}
            aria-label={m.palette_open()}
            title={m.palette_open()}
            onClick={toggle}
            className="desk-glass fixed right-xl bottom-xl z-40 flex size-touch items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-accent"
          >
            <MagnifyingGlassIcon aria-hidden="true" className="size-icon" />
          </motion.button>
        )}
        {open && (
          <motion.dialog
            key="palette-dialog"
            ref={(dialog) => {
              dialogRef.current = dialog;
              if (dialog && !dialog.open) {
                dialog.showModal();
                dialog.querySelector('input')?.focus();
                if (!isReducedMotion()) {
                  dialog.animate([{ opacity: 0 }, { opacity: 1 }], {
                    duration: 380,
                    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    pseudoElement: '::backdrop',
                  });
                  dialog.animate([{ opacity: 0.999 }, { opacity: 1 }], {
                    duration: 380,
                    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                  });
                }
              }
            }}
            layoutId={reduced ? undefined : 'palette-pill'}
            transition={PALETTE_TRANSITION}
            aria-label={m.palette_title()}
            onCancel={(event) => {
              event.preventDefault();
              close();
            }}
            // A modal dialog's backdrop belongs to the dialog itself: a click that lands on the dialog, not its content, is outside.
            onClick={(event) => {
              if (event.target === event.currentTarget) close();
            }}
            onKeyDownCapture={(event) => {
              // HoldButton consumes Escape to cancel a hold; the palette must close as well.
              if (event.key === 'Escape') {
                event.preventDefault();
                close();
              }
            }}
            className="fixed inset-x-0 top-auto bottom-xl m-auto max-h-dvh w-dialog-md max-w-full overflow-hidden rounded-xl border border-border bg-surface text-foreground backdrop:bg-background/55"
          >
            <motion.div
              initial={reduced ? undefined : { opacity: 0 }}
              animate={reduced ? undefined : { opacity: 1 }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={{ duration: 0.19, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col"
            >
              {selected ? (
                <div className="flex flex-col">
                  <div className="flex h-touch items-center gap-xs border-b border-border px-md">
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="flex items-center gap-2xs rounded-md px-xs py-2xs text-caption text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <ArrowLeftIcon className="size-icon-sm" />
                      <span>{m.palette_back()}</span>
                    </button>
                    <span className="truncate text-label text-foreground">{selected.label}</span>
                  </div>
                  <div className="max-h-widget-row overflow-y-auto p-md">
                    <PaletteForm action={selected} run={(input) => run(selected, input)} />
                  </div>
                </div>
              ) : (
                <Command
                  label={m.palette_search()}
                  className="flex flex-col"
                  loop
                  vimBindings={false}
                  onKeyDownCapture={(event) => {
                    if (status === 'pending' && event.key === 'Enter') {
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                >
                  <div className="order-1 flex h-touch shrink-0 items-center gap-sm border-b border-border px-md">
                    <MagnifyingGlassIcon
                      aria-hidden="true"
                      data-icon="magnifying-glass"
                      className="size-icon shrink-0 text-muted-foreground"
                    />
                    <Command.Input
                      onValueChange={setQuery}
                      placeholder={m.palette_search()}
                      className="h-full min-w-0 flex-1 bg-transparent text-label text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    <Kbd>{m.palette_escape()}</Kbd>
                  </div>
                  <Command.List
                    label={m.palette_title()}
                    className="order-2 max-h-widget-row overflow-y-auto overscroll-contain p-xs"
                  >
                    <Command.Empty asChild>
                      {/* cmdk.Empty supplies role=presentation through its slot, so the explicit status must win. */}
                      <output
                        // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Preserve live status through cmdk's slot role override.
                        role="status"
                        className="flex h-touch items-center justify-center text-label text-muted-foreground"
                      >
                        {registry.isError
                          ? m.palette_error()
                          : registry.isPending
                            ? m.palette_loading()
                            : m.palette_empty({ query })}
                      </output>
                    </Command.Empty>
                    <Command.Group heading={m.palette_goto()} className={groupClass}>
                      {zones.map((zone) => (
                        <Command.Item
                          key={zone.id}
                          value={zone.label()}
                          onSelect={() => {
                            close();
                            void navigate({ to: zone.path, params: zone.params });
                          }}
                          className={itemClass}
                        >
                          <zone.icon aria-hidden="true" className="size-icon shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">{zone.label()}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                    <Command.Group heading={m.palette_actions()} className={groupClass}>
                      {actions.map((action) => (
                        <Command.Item
                          key={action.path}
                          value={action.path}
                          keywords={[action.label, action.description]}
                          disabled={status === 'pending'}
                          onSelect={() => {
                            void choose(action);
                          }}
                          className={itemClass}
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
                    </Command.Group>
                  </Command.List>
                  <div className="order-3 flex h-touch shrink-0 items-center justify-between border-t border-border bg-muted/20 px-md text-caption text-muted-foreground">
                    <p aria-live="polite" className="truncate">
                      {status === 'pending'
                        ? m.action_pending()
                        : status === 'error'
                          ? m.palette_error()
                          : m.palette_keyboard_hint()}
                    </p>
                    <div className="flex shrink-0 items-center gap-xs">
                      <span className="flex items-center gap-2xs">
                        <Kbd>↑</Kbd>
                        <Kbd>↓</Kbd>
                      </span>
                      <Kbd>↵</Kbd>
                    </div>
                  </div>
                </Command>
              )}
            </motion.div>
          </motion.dialog>
        )}
      </AnimatePresence>
    </>
  );
}
