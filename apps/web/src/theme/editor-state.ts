import type { Colors } from './contrast.ts';
import { deriveColors, type Mode, type Seed, defaultSeed } from './derive.ts';
import type { ThemeValues } from './themes.ts';

export const roles = [
  'background',
  'surface',
  'surfaceRaised',
  'muted',
  'foreground',
  'mutedForeground',
  'border',
  'primary',
  'primaryForeground',
  'accent',
  'success',
  'danger',
] as const satisfies ReadonlyArray<keyof Colors>;

/** What the editor holds: the seed, and the roles set by hand on top of what the seed derives. */
export type EditorState = { mode: Mode; seed: Seed; manual: Partial<Colors> };

/** A theme saved before seeds existed has none: every role stays as stored, by hand. */
export function editorStateOf({ mode, colors, seed, manual }: ThemeValues): EditorState {
  if (!seed) return { mode, seed: defaultSeed, manual: { ...colors } };
  const kept = new Set<string>(manual);
  const byHand: Partial<Colors> = {};
  for (const role of roles) if (kept.has(role)) byHand[role] = colors[role];
  return { mode, seed, manual: byHand };
}

export function colorsOf({ mode, seed, manual }: EditorState): Colors {
  const colors = { ...deriveColors(mode, seed), ...manual };
  // The hairline follows the text color, as in the built-in themes, unless it was set by hand.
  return manual.border ? colors : { ...colors, border: `${colors.foreground.slice(0, 7)}1a` };
}

export function valuesOf(state: EditorState): ThemeValues {
  return {
    mode: state.mode,
    colors: colorsOf(state),
    seed: state.seed,
    manual: roles.filter((role) => state.manual[role] !== undefined),
  };
}
