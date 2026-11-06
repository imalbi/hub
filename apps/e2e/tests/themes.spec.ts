import type { APIRequestContext, Locator } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { chooseTheme, restoreScheme, writeScheme } from './themes.ts';

const builtIn = ['Scuro', 'Chiaro', 'Muschio', 'Pietra', 'Caelestia'];

async function deleteCustomThemes(pc: APIRequestContext) {
  const list = await (await pc.get('/trpc/theme.list')).json();
  for (const { id } of list.result.data)
    await pc.post('/trpc/theme.delete', {
      data: { id, confirmed: true },
      headers: { 'content-type': 'application/json' },
    });
}

const backgroundOf = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);

test.beforeEach(async ({ page }) => {
  await page.goto('/desk/settings');
});

test('every built-in theme has a card whose preview draws its own colors', async ({ page }) => {
  const previews = page.locator('fieldset [data-theme]');
  const backgrounds = new Set<string>();
  for (const [index, name] of builtIn.entries()) {
    await expect(page.getByRole('radio', { name, exact: true })).toBeAttached();
    backgrounds.add(await backgroundOf(previews.nth(index)));
  }
  expect(backgrounds.size).toBe(builtIn.length);
});

test('hovering a card tries the theme on the whole desk, leaving restores the chosen one', async ({ page }) => {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'ink');
  await page.getByText('Pietra', { exact: true }).hover();
  await expect(html).toHaveAttribute('data-theme', 'stone');
  await page.mouse.move(0, 0);
  await expect(html).toHaveAttribute('data-theme', 'ink');
  await expect(page.getByRole('radio', { name: 'Scuro', exact: true })).toBeChecked();
});

test('the cards are a radio group: arrow keys choose, and the choice survives a reload', async ({ page }) => {
  await page.getByRole('radio', { name: 'Scuro', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Chiaro', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
});

test('a duplicated theme previews live, refuses to save unreadable text, then saves, applies and deletes', async ({
  page,
  pc,
}) => {
  try {
    await page.getByRole('button', { name: 'Duplica Muschio' }).click();
    const editor = page.getByRole('form', { name: 'Nuovo tema' });
    await expect(editor).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'draft');
    await expect(editor.getByText('Contrasto sufficiente su tutte le coppie')).toBeVisible();

    // Secondary text the color of its panel: flagged with its ratio, and saving is blocked.
    const surface = await editor.getByLabel('Pannelli', { exact: true }).inputValue();
    await editor.getByLabel('Testo secondario', { exact: true }).fill(surface);
    await expect(editor.getByText(/^Testo secondario su Pannelli: 1:1, serve almeno 4,5:1$/)).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Salva' })).toBeDisabled();

    await editor.getByLabel('Testo secondario', { exact: true }).fill('#c8c8c0');
    await editor.getByLabel('Nome').fill('Bosco');
    await editor.getByRole('button', { name: 'Salva' }).click();
    await expect(editor).toBeHidden();

    const custom = page.getByRole('radio', { name: 'Bosco', exact: true });
    await expect(custom).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', /^custom-\d+$/);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', /^custom-\d+$/);

    // Deleting needs a hold; the device then falls back to Scuro.
    const remove = page.getByRole('button', { name: 'Tieni premuto per eliminare Bosco' });
    await remove.hover();
    await page.mouse.down();
    await expect(custom).toHaveCount(0, { timeout: 5000 });
    await page.mouse.up();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ink');
  } finally {
    await deleteCustomThemes(pc);
  }
});

test('the Caelestia theme follows the scheme file live and falls back when its text would not read', async ({
  page,
}) => {
  try {
    await chooseTheme(page, 'Caelestia');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'caelestia');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 20, 24)');

    writeScheme((scheme) => {
      scheme.colours.background = '202830';
    });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(32, 40, 48)', { timeout: 5000 });

    writeScheme((scheme) => {
      scheme.colours.onBackground = scheme.colours.background ?? '';
    });
    await expect(page.getByText('Testo poco leggibile: uso Scuro')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ink');
  } finally {
    restoreScheme();
  }
});
