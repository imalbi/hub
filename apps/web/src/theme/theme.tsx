import { useSubscription } from '@trpc/tanstack-react-query';
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { useTRPC } from '../lib/trpc.ts';
import { contrastFailures } from './contrast.ts';
import { builtInThemes, caelestiaId, customId, themeCss, type CustomTheme, type ThemeValues } from './themes.ts';

const storageKey = 'hub.theme';
const builtInIds: ReadonlySet<string> = new Set(builtInThemes.map((theme) => theme.id));

function readStored() {
  try {
    return localStorage.getItem(storageKey) ?? 'ink';
  } catch {
    return 'ink';
  }
}

/** Why the Caelestia theme is not shown as itself: the desktop has no scheme, or its text would not read. */
export type CaelestiaStatus = 'ok' | 'missing' | 'low-contrast';

type ThemeContextValue = {
  /** The chosen theme id (built-in, `caelestia` or `custom-<id>`), stored per device. */
  theme: string;
  setTheme: (id: string) => void;
  /** Shows a theme on the whole page until cleared, without choosing it. */
  setPreview: (id: string | null) => void;
  /** A theme being edited, drawn as `draft` so the editor and its preview update live. */
  setDraft: (values: ThemeValues | null) => void;
  custom: CustomTheme[] | undefined;
  caelestia: ThemeValues | null | undefined;
  caelestiaStatus: CaelestiaStatus;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Applies the chosen theme to `<html>` and draws the themes held as data (Caelestia, custom, the draft) into one style
 * element. `remote` is false on an unpaired deck, which cannot read themes from the server and gets the built-in ones.
 */
export function ThemeProvider({ remote, children }: { remote: boolean; children: ReactNode }) {
  const trpc = useTRPC();
  const [theme, updateTheme] = useState(readStored);
  const [preview, setPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<ThemeValues | null>(null);
  const custom = useSubscription(trpc.theme.onList.subscriptionOptions(undefined, { enabled: remote })).data;
  const caelestia = useSubscription(trpc.theme.onCaelestia.subscriptionOptions(undefined, { enabled: remote })).data;
  const caelestiaStatus: CaelestiaStatus = !caelestia
    ? 'missing'
    : contrastFailures(caelestia.colors).some(({ text, on }) => text === 'foreground' && on === 'background')
      ? 'low-contrast'
      : 'ok';

  // What actually lands on <html>: a theme that cannot be drawn falls back to a fixed one of the same mode.
  function resolve(id: string) {
    if (builtInIds.has(id) || id === 'draft') return id;
    if (id === caelestiaId) {
      if (caelestiaStatus === 'ok') return id;
      return caelestia?.mode === 'light' ? 'paper' : 'ink';
    }
    // Until the list arrives a custom id is kept, so a reload does not flash the default theme.
    if (custom === undefined && id.startsWith('custom-')) return id;
    return custom?.some((item) => customId(item.id) === id) ? id : 'ink';
  }

  const applied = resolve(preview ?? theme);
  useLayoutEffect(() => {
    // The colors glide to the new theme by themselves (registered properties in index.css), so this is a plain switch.
    document.documentElement.dataset.theme = applied;
  }, [applied]);
  useLayoutEffect(
    () => () => {
      document.documentElement.dataset.theme = 'ink';
    },
    [],
  );

  function setTheme(id: string) {
    updateTheme(id);
    try {
      localStorage.setItem(storageKey, id);
    } catch {
      /* The current view can still switch when storage is unavailable. */
    }
  }

  const css = [
    caelestia && caelestiaStatus === 'ok' ? themeCss(caelestiaId, caelestia) : '',
    ...(custom ?? []).map((item) => themeCss(customId(item.id), item.values)),
    draft ? themeCss('draft', draft) : '',
  ].join('\n');

  return (
    <ThemeContext.Provider value={{ theme, setTheme, setPreview, setDraft, custom, caelestia, caelestiaStatus }}>
      {/* Only validated hex colors reach this text (see `themeCss`). */}
      <style>{css}</style>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('ThemeProvider is missing');
  return context;
}
