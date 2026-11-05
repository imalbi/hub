import { expect, test } from '@playwright/test';
import { freezePomodoro } from './pomodoro-visual.ts';

// Only these new palette images are intentional; the existing desk/deck baselines stay unchanged.
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await freezePomodoro(page);
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
  await page.route('**/trpc/health*', (route) =>
    route.fulfill({ json: [{ result: { data: { ok: true, uptime: 42 } } }] }),
  );
  await page.goto('/desk/studio');
  await expect(page.getByRole('button', { name: 'Avvia', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('option', { name: /Avvia Pomodoro/ })).toBeVisible();
});

test('the palette on the 4K desk matches the baseline', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Cerca azioni' }).fill('Pomodoro');
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-palette-4k.png', { animations: 'disabled' });
});

test('the generated input form matches the baseline', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Cerca azioni' }).fill('Seleziona uscita audio');
  await page.keyboard.press('Enter');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await expect(palette.getByLabel('label', { exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(palette).toHaveScreenshot('palette-input.png', { animations: 'disabled' });
});

test('the danger confirmation matches the baseline', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Cerca azioni' }).fill('Spegni PC');
  await page.keyboard.press('Enter');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await expect(palette.getByRole('button', { name: 'Tieni premuto per Spegni PC' })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(palette).toHaveScreenshot('palette-danger.png', { animations: 'disabled' });
});
