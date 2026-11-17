import { answerQueries } from './desktop.ts';
import { clean, seed, seedShifts } from './calendar-data.ts';
import { expect, test } from './fixtures.ts';

const json = { 'content-type': 'application/json' };
// Sunday 15 November 2026, fixed, so every label and the today marks are the same on each run.
const NOW = new Date(2026, 10, 15, 10, 0);

test.beforeEach(async ({ page, pc }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(NOW);
  await answerQueries(page, { health: { ok: true, uptime: 42 } });
  await seed(pc);
  await seedShifts(pc);
  // Two dated things after the week, for the "Poi:" line.
  for (const [title, day] of [
    ['Esame', '2026-11-24'],
    ['Revisione', '2026-11-27'],
  ] as const)
    await pc.post('/trpc/calendar.add', { data: { title, day }, headers: json });
  await pc.post('/trpc/notes.add', { data: { text: 'Chiamare il dentista', forDay: '2026-11-20' }, headers: json });
});
test.afterEach(async ({ pc }) => clean(pc));

const sizes = [
  { name: '', width: 1920, height: 1080 },
  { name: '-4k', width: 3840, height: 2160 },
];
for (const size of sizes) {
  test(`the week at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/desk/calendar');
    await page.getByRole('toolbar', { name: 'Vista' }).getByRole('button', { name: 'Settimana' }).click();
    // The board draws 16 to 22 November, the week after today.
    await page.getByRole('button', { name: 'Settimana successiva' }).click();
    await expect(page.getByRole('region', { name: '16 - 22 novembre' })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.mouse.move(0, 0);
    await expect(page.locator('[data-page-surface]')).toHaveScreenshot(`calendar-week${size.name}.png`, {
      animations: 'disabled',
    });
  });

  test(`the agenda at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/desk/calendar');
    await page.getByRole('toolbar', { name: 'Vista' }).getByRole('button', { name: 'Agenda' }).click();
    await expect(page.getByRole('region', { name: 'Prossimi giorni' })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.mouse.move(0, 0);
    await expect(page.locator('[data-page-surface]')).toHaveScreenshot(`calendar-agenda${size.name}.png`, {
      animations: 'disabled',
    });
  });
}
