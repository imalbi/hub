import { contrast, type Colors } from './contrast.ts';

export type Mode = 'dark' | 'light';

/** What a custom theme is made of: a tinted base, one accent hue and how hard the text reads against it. */
export type Seed = { baseHue: number; baseChroma: number; accentHue: number; contrast: number };

export const defaultSeed: Seed = { baseHue: 0, baseChroma: 0, accentHue: 190, contrast: 70 };

export const basePresets = [
  { id: 'neutral', hue: 0, chroma: 0 },
  { id: 'stone', hue: 240, chroma: 0.012 },
  { id: 'moss', hue: 150, chroma: 0.016 },
  { id: 'sand', hue: 80, chroma: 0.014 },
  { id: 'night', hue: 265, chroma: 0.022 },
  { id: 'plum', hue: 330, chroma: 0.016 },
  { id: 'sea', hue: 200, chroma: 0.016 },
] as const;

export const accentPresets = [
  { id: 'cyan', hue: 190 },
  { id: 'green', hue: 145 },
  { id: 'coral', hue: 35 },
  { id: 'amber', hue: 75 },
  { id: 'indigo', hue: 265 },
  { id: 'rose', hue: 350 },
  { id: 'lime', hue: 115 },
] as const;

const hex2 = (channel: number) =>
  Math.round(Math.min(1, Math.max(0, channel)) * 255)
    .toString(16)
    .padStart(2, '0');

const encode = (c: number) => (c <= 0.003_130_8 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

// Björn Ottosson's OKLab matrices: https://bottosson.github.io/posts/oklab/
function oklchToRgb(l: number, c: number, h: number) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const lp = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const mp = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const sp = (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
  return [
    4.076_741_662_1 * lp - 3.307_711_591_3 * mp + 0.230_969_929_2 * sp,
    -1.268_438_004_6 * lp + 2.609_757_401_1 * mp - 0.341_319_396_5 * sp,
    -0.004_196_086_3 * lp - 0.703_418_614_7 * mp + 1.707_614_701 * sp,
  ].map(encode);
}

const inGamut = (rgb: number[]) => rgb.every((channel) => channel >= -0.0005 && channel <= 1.0005);

/** `#rrggbb` for an OKLCH color; chroma steps down until it fits sRGB, so a hue never clips into another one. */
export function oklchHex(l: number, c: number, h: number) {
  let chroma = c;
  let rgb = oklchToRgb(l, chroma, h);
  while (!inGamut(rgb) && chroma > 0) {
    chroma = Math.max(0, chroma - 0.004);
    rgb = oklchToRgb(l, chroma, h);
  }
  return `#${rgb.map(hex2).join('')}`;
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** The 12 roles of a theme from its seed. Success and danger keep their hues; the rest follows the seed. */
export function deriveColors(mode: Mode, { baseHue: h, baseChroma: c, accentHue, contrast: level }: Seed): Colors {
  const k = Math.min(100, Math.max(0, level)) / 100;
  const dark = mode === 'dark';
  const tone = dark
    ? {
        bg: 0.13,
        surface: 0.18,
        raised: 0.23,
        muted: 0.27,
        fg: lerp(0.62, 0.97, k),
        mfg: lerp(0.5, 0.78, k),
        accent: 0.78,
      }
    : {
        bg: 0.94,
        surface: 0.99,
        raised: 0.95,
        muted: 0.9,
        fg: lerp(0.6, 0.16, k),
        mfg: lerp(0.62, 0.4, k),
        accent: 0.52,
      };
  const foreground = oklchHex(tone.fg, Math.min(c, 0.012), h);
  return {
    background: oklchHex(tone.bg, c * 0.8, h),
    foreground,
    surface: oklchHex(tone.surface, c, h),
    surfaceRaised: oklchHex(tone.raised, c * 1.1, h),
    muted: oklchHex(tone.muted, c * 1.2, h),
    mutedForeground: oklchHex(tone.mfg, c * 1.4, h),
    border: `${foreground}1a`,
    primary: foreground,
    primaryForeground: oklchHex(dark ? tone.bg : tone.surface, dark ? c * 0.8 : c, h),
    accent: oklchHex(tone.accent, 0.13, accentHue),
    success: dark ? oklchHex(0.75, 0.12, 155) : oklchHex(0.5, 0.13, 155),
    danger: dark ? oklchHex(0.68, 0.17, 25) : oklchHex(0.5, 0.17, 25),
  };
}

/** The weakest text pair on the three grounds text sits on: the page, a panel and an inner panel. */
export function textRatio({ foreground, background, surface, muted }: Colors) {
  return Math.min(contrast(foreground, background), contrast(foreground, surface), contrast(foreground, muted));
}

export type Rating = 'aaa' | 'aa' | 'low';
export const rate = (ratio: number): Rating => (ratio >= 7 ? 'aaa' : ratio >= 4.5 ? 'aa' : 'low');

/** The closest seed to each built-in theme, so duplicating one starts from something that looks like it. */
export const builtInSeeds: Record<string, { mode: Mode; seed: Seed }> = {
  ink: { mode: 'dark', seed: defaultSeed },
  paper: { mode: 'light', seed: defaultSeed },
  moss: { mode: 'dark', seed: { baseHue: 150, baseChroma: 0.016, accentHue: 145, contrast: 70 } },
  stone: { mode: 'light', seed: { baseHue: 240, baseChroma: 0.012, accentHue: 35, contrast: 70 } },
};
