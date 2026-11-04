import { z } from 'zod';

/** Only `#rrggbb` or `#rrggbbaa` ever reaches the generated CSS, so a value cannot close the rule or inject another. */
export const hexColor = z.string().regex(/^#[\da-f]{6}([\da-f]{2})?$/i);

export const themeColorsSchema = z.object({
  background: hexColor,
  foreground: hexColor,
  surface: hexColor,
  surfaceRaised: hexColor,
  muted: hexColor,
  mutedForeground: hexColor,
  border: hexColor,
  primary: hexColor,
  primaryForeground: hexColor,
  accent: hexColor,
  success: hexColor,
  danger: hexColor,
});

/** A theme as data: Caelestia's and the owner's custom themes. Built-in themes stay as CSS in the web app. */
export const themeValuesSchema = z.object({
  // Dark themes get frosted glass on floating chrome; light ones keep it solid.
  mode: z.enum(['dark', 'light']),
  colors: themeColorsSchema,
});

export type ThemeValues = z.infer<typeof themeValuesSchema>;
