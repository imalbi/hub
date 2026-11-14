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
  { id: 'night', label: m.theme_night, mode: 'dark' },
  { id: 'ember', label: m.theme_ember, mode: 'dark' },
  { id: 'lagoon', label: m.theme_lagoon, mode: 'dark' },
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
  // Same derivations as the built-in themes: frosted chrome on both, a lighter glass and a tinted glow in the light.
  const chrome =
    mode === 'dark'
      ? [
          `--glass:${colors.surface.slice(0, 7)}b8`,
          `--glass-border:${colors.foreground.slice(0, 7)}29`,
          '--glass-filter:blur(var(--blur-glass))',
          '--backdrop-glow:var(--muted)',
          '--backdrop-art-display:block',
          '--backdrop-art-opacity:0.1',
          'color-scheme:dark',
        ]
      : [
          `--glass:${colors.surface.slice(0, 7)}b3`,
          '--glass-border:var(--border)',
          '--glass-filter:blur(var(--blur-glass))',
          '--backdrop-glow:color-mix(in oklab, var(--accent) 12%, var(--background))',
          '--backdrop-art-display:none',
          '--backdrop-art-opacity:0.04',
          'color-scheme:light',
        ];
  return `[data-theme='${id}']{${[...declarations, ...chrome].join(';')}}`;
}
