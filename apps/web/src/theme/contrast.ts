export type Colors = {
  background: string;
  foreground: string;
  surface: string;
  surfaceRaised: string;
  muted: string;
  mutedForeground: string;
  border: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  success: string;
  danger: string;
};

type Rgba = [number, number, number, number];

/** `#rrggbb` or `#rrggbbaa` to 0..1 channels; anything else is null. */
export function parseHex(hex: string): Rgba | null {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i.exec(hex);
  if (!match) return null;
  const [, r, g, b, a] = match;
  return [channel(r), channel(g), channel(b), channel(a ?? 'ff')];
}

const channel = (part = '00') => Number.parseInt(part, 16) / 255;
const linear = (c: number) => (c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance([r, g, b]: Rgba) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio; a translucent foreground is first composited over the background. */
export function contrast(foreground: string, background: string) {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (!fg || !bg) return 1;
  const alpha = fg[3];
  const mix = (i: 0 | 1 | 2) => fg[i] * alpha + bg[i] * (1 - alpha);
  const a = luminance([mix(0), mix(1), mix(2), 1]);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Text pairs need 4.5:1; the accent draws focus rings and the active state, which need 3:1 against the panel.
const checks: Array<{ text: keyof Colors; on: keyof Colors; min: number }> = [
  { text: 'foreground', on: 'background', min: 4.5 },
  { text: 'foreground', on: 'surface', min: 4.5 },
  { text: 'foreground', on: 'muted', min: 4.5 },
  { text: 'mutedForeground', on: 'surface', min: 4.5 },
  { text: 'primaryForeground', on: 'primary', min: 4.5 },
  { text: 'accent', on: 'surface', min: 3 },
];

export type ContrastFailure = { text: keyof Colors; on: keyof Colors; ratio: number; min: number };

/** The pairs that do not meet their minimum, empty when the theme reads well. */
export function contrastFailures(colors: Colors): ContrastFailure[] {
  return checks.flatMap(({ text, on, min }) => {
    const ratio = contrast(colors[text], colors[on]);
    return ratio < min ? [{ text, on, ratio: Math.floor(ratio * 10) / 10, min }] : [];
  });
}
