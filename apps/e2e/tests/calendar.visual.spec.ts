import { answerQueries } from './desktop.ts';
import { expect, test } from './fixtures.ts';
import { clean, seed } from './calendar-data.ts';

// Sunday 15 November 2026, fixed, so the grid, today's pill and every label are the same on each run.
const NOW = new Date(2026, 10, 15, 10, 0);

test.beforeEach(async ({ page, pc }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(NOW);
  await answerQueries(page, { health: { ok: true, uptime: 42 } });
  await seed(pc);
});
test.afterEach(async ({ pc }) => clean(pc));

const sizes = [
  { name: '', width: 1920, height: 1080 },
  { name: '-4k', width: 3840, height: 2160 },
];
for (const size of sizes) {
  test(`the month at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/desk/calendar');
    await page.getByRole('button', { name: 'giovedì 19 novembre' }).click({ position: { x: 20, y: 6 } });
    await expect(page.getByRole('complementary', { name: 'giovedì 19 novembre' })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.mouse.move(0, 0);
    await expect(page.locator('[data-page-surface]')).toHaveScreenshot(`calendar-month${size.name}.png`, {
      animations: 'disabled',
    });
  });
}
