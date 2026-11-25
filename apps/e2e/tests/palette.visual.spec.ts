import { answerQueries } from './desktop.ts';
import { expect, test } from '@playwright/test';
import { freezePomodoro } from './pomodoro-visual.ts';

// The palette grows out of the pill at the top center of the title row (step 20).
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await freezePomodoro(page);
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
  await answerQueries(page, { health: { ok: true, uptime: 42 }, 'pomodoro.today': [] });
  await page.goto('/desk');
  await expect(page.getByRole('button', { name: 'Avvia', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Panoramica', exact: true })).toBeVisible();
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

test('the palette on a 1920x1080 desk matches the baseline', async ({ page }) => {
  // The palette places itself when it opens: resizing while it is open (the 4K one from beforeEach) left it off
  // centre by a varying amount. Close, resize, open again.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Comandi' })).not.toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('option', { name: /Avvia Pomodoro/ })).toBeVisible();
  await page.getByRole('combobox', { name: 'Cerca azioni' }).fill('Pomodoro');
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-palette.png', { animations: 'disabled' });
});

test('the resting palette pill on a 4K zone matches the baseline', async ({ page }) => {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Comandi' })).not.toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-palette-rest-4k.png', { animations: 'disabled' });
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
