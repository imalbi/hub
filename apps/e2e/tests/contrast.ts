import type { Locator } from '@playwright/test';

export function contrastRatio(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas');
    const ancestors: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) ancestors.push(node);
    // A transparent or mid-transition button still sits on its panel; transparent pixels are not black.
    for (const ancestor of ancestors.toReversed()) {
      context.fillStyle = getComputedStyle(ancestor).backgroundColor;
      context.fillRect(0, 0, 2, 1);
    }
    context.fillStyle = style.color;
    context.fillRect(0, 0, 1, 1);
    const colors = context.getImageData(0, 0, 2, 1).data;
    function luminance(offset: number) {
      const linear = [0, 1, 2].map((index) => {
        const value = (colors[offset + index] ?? 0) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
    }
    const a = luminance(0),
      b = luminance(4);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}
