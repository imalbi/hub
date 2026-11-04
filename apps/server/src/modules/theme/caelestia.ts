import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { createLiveHub } from '../../core/live.ts';
import { themeColorsSchema, type ThemeValues } from './values.ts';

// Caelestia writes bare hex (`08080D`), one flat object of Material roles plus its own extras.
const role = z
  .string()
  .regex(/^#?[\da-f]{6}$/i)
  .transform((value) => `#${value.replace('#', '').toLowerCase()}`);

const schemeSchema = z.object({
  mode: z.enum(['dark', 'light']),
  colours: z.record(z.string(), z.unknown()),
});

// Fallbacks per mode when a role is missing: the `ink` and `paper` values of index.css converted from oklch to hex.
const fallback: Record<ThemeValues['mode'], ThemeValues['colors']> = {
  dark: {
    background: '#070707',
    foreground: '#f2f2f2',
    surface: '#121212',
    surfaceRaised: '#1d1d1d',
    muted: '#262626',
    mutedForeground: '#989898',
    border: '#ffffff1a',
    primary: '#f2f2f2',
    primaryForeground: '#070707',
    accent: '#99c9c5',
    success: '#6ac48c',
    danger: '#ef6661',
  },
  light: {
    background: '#ebebe9',
    foreground: '#121212',
    surface: '#fcfcfc',
    surfaceRaised: '#121212',
    muted: '#dededc',
    mutedForeground: '#646360',
    border: '#0000001a',
    primary: '#121212',
    primaryForeground: '#fcfcfc',
    accent: '#2c807c',
    success: '#14874e',
    danger: '#c92f33',
  },
};

// Our roles from Caelestia's. Buttons stay neutral (onSurface on surface); Caelestia's key color becomes the one accent.
const roles: Record<keyof ThemeValues['colors'], string> = {
  background: 'background',
  foreground: 'onBackground',
  surface: 'surfaceContainer',
  surfaceRaised: 'surfaceContainerHigh',
  muted: 'surfaceContainerHighest',
  mutedForeground: 'onSurfaceVariant',
  border: 'outlineVariant',
  primary: 'onSurface',
  primaryForeground: 'surface',
  accent: 'primary',
  success: 'success',
  danger: 'error',
};

/** Caelestia's scheme as our theme values, or null when the text is not a scheme at all. Missing roles fall back. */
export function parseCaelestiaScheme(text: string): ThemeValues | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const scheme = schemeSchema.safeParse(json);
  if (!scheme.success) return null;
  const { mode, colours } = scheme.data;
  const found = Object.entries(roles).flatMap(([key, source]) => {
    const value = role.safeParse(colours[source]);
    return value.success ? [[key, value.data]] : [];
  });
  return { mode, colors: themeColorsSchema.parse({ ...fallback[mode], ...Object.fromEntries(found) }) };
}

/**
 * The live Caelestia theme. Polls the file only while a client is subscribed (the same hub as every other live state)
 * and keeps the last good theme when the file is briefly broken, as it is while Caelestia rewrites it.
 */
export function createCaelestiaTheme(path: string | undefined, intervalMs = 2000) {
  let lastGood: ThemeValues | null = null;
  async function read() {
    if (!path) return null;
    try {
      lastGood = parseCaelestiaScheme(await readFile(path, 'utf8')) ?? lastGood;
    } catch {
      // A missing file means Caelestia is not installed or not running yet; keep whatever was last seen.
    }
    return lastGood;
  }
  return { read, ...createLiveHub(read, intervalMs) };
}

export type CaelestiaTheme = ReturnType<typeof createCaelestiaTheme>;
