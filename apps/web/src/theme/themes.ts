import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@hub/server';
import { m } from '../paraglide/messages.js';
import { parseHex } from './contrast.ts';

export type CustomTheme = inferRouterOutputs<AppRouter>['theme']['list'][number];
export type ThemeValues = CustomTheme['values'];

/** The themes that ship as CSS in index.css, in picker order. `ink` is also the default on :root. */
export const builtInThemes = [
  { id: 'ink', label: m.theme_ink, mode: 'dark' },
  { id: 'paper', label: m.theme_paper, mode: 'light' },
  { id: 'moss', label: m.theme_moss, mode: 'dark' },
  { id: 'stone', label: m.theme_stone, mode: 'light' },
] as const;

export const caelestiaId = 'caelestia';
export const customId = (id: number) => `custom-${id}`;

const cssNames: Record<keyof ThemeValues['colors'], string> = {
  background: '--background',
  foreground: '--foreground',
  surface: '--surface',
  surfaceRaised: '--surface-raised',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  border: '--border',
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  accent: '--accent',
  success: '--success',
  danger: '--danger',
};

/**
 * One `[data-theme]` rule for a theme held as data. The server validates every color as hex and this checks again, so
 * no value can end the rule; a theme with a bad value produces no rule at all and the page keeps its default colors.
 */
export function themeCss(id: string, { mode, colors }: ThemeValues) {
  if (!/^[a-z\d-]+$/.test(id)) return '';
  const entries = Object.entries(colors);
  if (entries.some(([, value]) => !parseHex(value))) return '';
  const declarations = Object.entries(cssNames).map(([key, name]) => `${name}:${Object.fromEntries(entries)[key]}`);
  // Same derivations as the built-in themes: frosted chrome in the dark, solid in the light.
  const chrome =
    mode === 'dark'
      ? [
          `--glass:${colors.surface.slice(0, 7)}b8`,
          `--glass-border:${colors.foreground.slice(0, 7)}29`,
          '--glass-filter:blur(var(--blur-glass))',
          '--backdrop-glow:var(--muted)',
          '--backdrop-art-display:block',
        ]
      : [
          '--glass:var(--surface)',
          '--glass-border:var(--border)',
          '--glass-filter:none',
          '--backdrop-glow:var(--background)',
          '--backdrop-art-display:none',
        ];
  return `[data-theme='${id}']{${[...declarations, ...chrome].join(';')}}`;
}

const hex = (c: number) => c.toString(16).padStart(2, '0');

/** A computed CSS color (any syntax the browser accepts, oklch included) as #rrggbb or #rrggbbaa, through a 1px canvas. */
export function cssColorToHex(color: string) {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return '#000000';
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 255] = context.getImageData(0, 0, 1, 1).data;
  // Canvas pixels are premultiplied in practice; undo it so a translucent border keeps its own color.
  const unpremultiply = (c: number) => (a === 0 ? 0 : Math.min(255, Math.round((c * 255) / a)));
  const rgb = `#${hex(unpremultiply(r))}${hex(unpremultiply(g))}${hex(unpremultiply(b))}`;
  return a === 255 ? rgb : `${rgb}${hex(a)}`;
}

/** The colors of any theme as rendered inside `element` (scoped with `data-theme`), for duplicating a built-in one. */
export function readThemeValues(element: Element, mode: ThemeValues['mode']): ThemeValues {
  const style = getComputedStyle(element);
  const read = (name: string) => cssColorToHex(style.getPropertyValue(name).trim());
  const colors = Object.fromEntries(Object.entries(cssNames).map(([key, name]) => [key, read(name)]));
  return { mode, colors: { ...fallbackColors, ...colors } };
}

// Only used if a computed variable were missing; every built-in theme defines all of them.
const fallbackColors: ThemeValues['colors'] = {
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
};
