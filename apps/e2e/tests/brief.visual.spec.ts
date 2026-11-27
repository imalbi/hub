import { expect, test } from './fixtures.ts';
import { briefBullets, mockBrief, placeBrief } from './brief-data.ts';

test('J5: brief widget at 4K matches its dedicated baseline', async ({ page, pc }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockBrief(page);
  await placeBrief(pc);
  try {
    await page.goto('/desk');
    const panel = page.getByRole('region', { name: 'Brief del mattino' });
    await expect(panel.getByRole('listitem')).toHaveText(briefBullets);
    await page.evaluate(async () => document.fonts.ready);
    await expect(panel).toHaveScreenshot('brief-widget-4k.png');
  } finally {
    await page.close();
    await pc.post('/trpc/layout.reset', { data: { zone: 'overview' } });
  }
});
