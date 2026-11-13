import { encode } from 'uqr';

/** SVG path of the dark modules, one unit square each, plus the quiet zone (4 modules, the QR spec minimum). */
export function qrPath(text: string) {
  const border = 4;
  const modules = encode(text, { ecc: 'M', border: 0 }).data;
  let d = '';
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + border} ${y + border}h1v1h-1z`;
    }),
  );
  return { d, size: modules.length + border * 2 };
}
