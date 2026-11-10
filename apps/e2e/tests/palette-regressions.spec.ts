import { expect, test } from './fixtures.ts';

test('opening a generated form moves keyboard focus to its first control', async ({ page }) => {
  await page.goto('/desk');
  await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await palette.getByRole('combobox').fill('Seleziona uscita audio');
  await expect(palette.getByRole('option', { name: /Seleziona uscita audio/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(palette.getByRole('textbox', { name: 'label', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(palette).not.toBeVisible();
  await page.keyboard.press('Control+k');
  await palette.getByRole('combobox').fill('Spegni PC');
  await expect(palette.getByRole('option', { name: /Spegni PC/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(palette.getByRole('button', { name: 'Tieni premuto per Spegni PC' })).toBeFocused();
});

test('completion from a closed session cannot dismiss a newly opened form', async ({ page }) => {
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/trpc/news.refresh*', async (route) => {
    await held;
    await route.continue();
  });
  try {
    await page.goto('/desk');
    await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toBeVisible();
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Comandi' });
    await palette.getByRole('combobox').fill('Aggiorna notizie');
    await expect(palette.getByRole('option', { name: /Aggiorna notizie/ })).toBeVisible();
    const requested = page.waitForRequest((request) => request.url().includes('news.refresh'));
    await page.keyboard.press('Enter');
    await requested;
    await page.keyboard.press('Escape');
    await expect(palette).not.toBeVisible();
    await page.keyboard.press('Control+k');
    await palette.getByRole('combobox').fill('Seleziona uscita audio');
    await expect(palette.getByRole('option', { name: /Seleziona uscita audio/ })).toBeVisible();
    await page.keyboard.press('Enter');
    const field = palette.getByRole('textbox', { name: 'label', exact: true });
    await field.fill('Casse');
    const completed = page.waitForResponse((response) => response.url().includes('news.refresh'));
    release?.();
    await completed;
    await expect.poll(() => page.evaluate(() => localStorage.getItem('hub.palette.recent'))).toContain('news.refresh');
    await expect(field).toHaveValue('Casse');
    await expect(palette).toBeVisible();
  } finally {
    release?.();
  }
});

test('a palette layout reset refreshes the board without a reload', async ({ page, pc }) => {
  await pc.post('/trpc/layout.save', { data: { zone: 'overview', items: [] } });
  try {
    await page.goto('/desk');
    await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toBeVisible();
    await expect(page.locator('[data-widget]')).toHaveCount(0);
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Comandi' });
    await palette.getByRole('combobox').fill('Ripristina disposizione widget');
    await expect(palette.getByRole('option', { name: /Ripristina disposizione widget/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await palette.getByRole('textbox', { name: 'zone', exact: true }).fill('overview');
    await palette.getByRole('button', { name: 'Esegui', exact: true }).click();
    await expect(palette.getByRole('status')).toHaveText('Fatto');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-widget="pomodoro"]')).toBeVisible();
  } finally {
    await pc.post('/trpc/layout.reset', { data: { zone: 'overview' } });
  }
});
