import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { restoreDesktop } from './desktop.ts';
import { expect, test } from './fixtures.ts';
import { SERVER_URL } from './hosts.ts';
import { ballOf } from './ball.ts';
import { chooseTheme, restoreScheme, writeScheme } from './themes.ts';

const builtIn = ['Scuro', 'Chiaro', 'Muschio', 'Pietra', 'Caelestia'];
const json = { 'content-type': 'application/json' };

async function deleteCustomThemes(pc: APIRequestContext) {
  const list = await (await pc.get('/trpc/theme.list')).json();
  for (const { id } of list.result.data)
    await pc.post('/trpc/theme.delete', { data: { id, confirmed: true }, headers: json });
}

const px = (value: string) => Number.parseFloat(value);
const backgroundOf = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);
const rootVar = (page: Page, name: string) =>
  page.evaluate((property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(), name);
const radiusOf = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).borderTopLeftRadius);
const blurOf = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).backdropFilter);

const editorOf = (page: Page) => page.getByRole('form', { name: 'Nuovo tema' });
/** A swatch or a theme row is a label around a visually hidden radio: click the label, as a user does. */
const pick = (page: Page, name: string) =>
  page.locator('label', { has: page.getByRole('radio', { name, exact: true }) }).click();
/** The color input of one of the 12 roles, inside the Colori derivati list. */
const role = (editor: Locator, name: string) => editor.locator('details').getByLabel(name, { exact: true });
const setSlider = async (scope: Locator, name: string, key: string) => {
  await scope.getByRole('slider', { name, exact: true }).focus();
  await scope.page().keyboard.press(key);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/desk/settings/appearance');
});

test('every theme is one row with its name, a note and five swatches drawn in its own colors', async ({ page }) => {
  const rows = page.locator('fieldset li');
  await expect(rows).toHaveCount(builtIn.length);
  const grounds = new Set<string>();
  for (const [index, name] of builtIn.entries()) {
    await expect(page.getByRole('radio', { name, exact: true })).toBeAttached();
    const swatches = rows.nth(index).locator('[data-theme] > span');
    await expect(swatches).toHaveCount(5);
    grounds.add(await backgroundOf(swatches.first()));
  }
  expect(grounds.size).toBe(builtIn.length);
  await expect(rows.first()).toContainText('neutro');
  await expect(page.getByRole('button', { name: 'Duplica Muschio' })).toBeVisible();
});

test('native controls follow the theme, so the date picker icon is readable in the dark ones', async ({ page }) => {
  const scheme = () => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  for (const [name, expected] of [
    ['Scuro', 'dark'],
    ['Chiaro', 'light'],
    ['Muschio', 'dark'],
    ['Pietra', 'light'],
  ] as const) {
    await chooseTheme(page, name);
    await expect.poll(scheme).toBe(expected);
  }
  await chooseTheme(page, 'Scuro');
});

test('hovering a row tries the theme on the whole desk, leaving restores the chosen one', async ({ page }) => {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'ink');
  await page.getByText('Pietra', { exact: true }).hover();
  await expect(html).toHaveAttribute('data-theme', 'stone');
  await page.mouse.move(0, 0);
  await expect(html).toHaveAttribute('data-theme', 'ink');
  await expect(page.getByRole('radio', { name: 'Scuro', exact: true })).toBeChecked();
});

test('the rows are a radio group: arrow keys choose, and the choice survives a reload', async ({ page }) => {
  await page.getByRole('radio', { name: 'Scuro', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: 'Chiaro', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await expect(page.getByRole('radio', { name: 'Chiaro', exact: true })).toBeChecked();
});

test('the editor recolors the desk live, refuses weak contrast with its reason, saves the seed and reopens it', async ({
  page,
  pc,
}) => {
  try {
    await page.getByRole('button', { name: 'Duplica Muschio' }).click();
    const editor = editorOf(page);
    await expect(editor).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'draft');
    await expect(editor.getByText('Contrasto sufficiente su tutte le coppie')).toBeVisible();
    await expect(editor.getByText('AAA', { exact: true }).first()).toBeVisible();

    // Base, accent and contrast each move the colors of the page behind the sheet.
    const before = { surface: await rootVar(page, '--surface'), accent: await rootVar(page, '--accent') };
    await pick(page, 'Prugna');
    await expect.poll(() => rootVar(page, '--surface')).not.toBe(before.surface);
    await pick(page, 'Corallo');
    await expect.poll(() => rootVar(page, '--accent')).not.toBe(before.accent);
    const foreground = await rootVar(page, '--foreground');
    await setSlider(editor, 'Contrasto', 'Home');
    await expect.poll(() => rootVar(page, '--foreground')).not.toBe(foreground);

    // At the weak end the text is below AA: the badge says so, the reason is listed and saving is off.
    await expect(editor.getByText('Basso', { exact: true }).first()).toBeVisible();
    await expect(editor.getByText(/serve almeno 4,5:1$/).first()).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Salva' })).toBeDisabled();

    await setSlider(editor, 'Contrasto', 'End');
    await expect(editor.getByText('AAA', { exact: true }).first()).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Salva' })).toBeEnabled();
    await editor.getByLabel('Nome').fill('Bosco');
    await pick(page, 'Neutro');
    await pick(page, 'Prugna');
    await editor.getByRole('button', { name: 'Chiaro' }).click();
    await editor.getByRole('button', { name: 'Scuro' }).click();
    await editor.getByRole('button', { name: 'Salva' }).click();
    await expect(editor).toBeHidden();

    await expect(page.getByRole('radio', { name: 'Bosco', exact: true })).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', /^custom-\d+$/);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', /^custom-\d+$/);

    // The same seed comes back: the chosen presets and the contrast at the strong end.
    await page.getByRole('button', { name: 'Modifica Bosco' }).click();
    await expect(page.getByRole('form', { name: 'Modifica tema' })).toBeVisible();
    const reopened = page.getByRole('form', { name: 'Modifica tema' });
    await expect(reopened.getByRole('radio', { name: 'Prugna', exact: true })).toBeChecked();
    await expect(reopened.getByRole('radio', { name: 'Corallo', exact: true })).toBeChecked();
    await expect(reopened.getByRole('slider', { name: 'Contrasto', exact: true })).toHaveValue('100');
    await expect(reopened.getByRole('button', { name: 'Scuro' })).toHaveAttribute('aria-pressed', 'true');
    await reopened.getByRole('button', { name: 'Annulla' }).click();

    // Deleting needs a hold; the device then falls back to Scuro.
    const remove = page.getByRole('button', { name: 'Tieni premuto per eliminare Bosco' });
    await remove.hover();
    await page.mouse.down();
    await expect(page.getByRole('radio', { name: 'Bosco', exact: true })).toHaveCount(0, { timeout: 5000 });
    await page.mouse.up();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ink');
  } finally {
    await deleteCustomThemes(pc);
  }
});

test('a role set by hand is marked manual, can return to its computed color and counts in the contrast check', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Duplica Scuro' }).click();
  const editor = editorOf(page);
  await expect(editor.getByText('manuale', { exact: true })).toHaveCount(0);
  const roles = editor.locator('details');
  await expect(roles).not.toHaveAttribute('open', '');
  await roles.getByText('Colori derivati').click();
  await expect(roles.locator('li')).toHaveCount(12);

  const computed = await role(editor, 'Accento').inputValue();
  await role(editor, 'Accento').fill('#ff8800');
  await expect(editor.getByText('manuale', { exact: true })).toHaveCount(1);
  // The seed keeps moving the derived roles but not the one set by hand.
  await pick(page, 'Indaco');
  await expect(role(editor, 'Accento')).toHaveValue('#ff8800');
  await editor.getByRole('button', { name: 'Ripristina Accento' }).click();
  await expect(editor.getByText('manuale', { exact: true })).toHaveCount(0);
  await expect(role(editor, 'Accento')).not.toHaveValue(computed);

  // Text set to the color of its ground fails the same check the seed does, and saving stays off until it is released.
  const ground = await role(editor, 'Fondo').inputValue();
  await role(editor, 'Testo').fill(ground);
  await expect(editor.getByText('manuale', { exact: true })).toHaveCount(1);
  await expect(editor.getByText(/^Testo su Fondo: 1:1, serve almeno 4,5:1$/)).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Salva' })).toBeDisabled();
  await editor.getByRole('button', { name: 'Ripristina Testo' }).click();
  await expect(editor.getByRole('button', { name: 'Salva' })).toBeEnabled();
  await editor.getByRole('button', { name: 'Annulla' }).click();
});

test('a theme saved before seeds existed opens with every role by hand and still saves', async ({ page, pc }) => {
  const legacy = {
    mode: 'dark',
    colors: {
      background: '#101418',
      foreground: '#e0e3e8',
      surface: '#1c2024',
      surfaceRaised: '#262a2f',
      muted: '#31353a',
      mutedForeground: '#c0c7cd',
      border: '#ffffff1a',
      primary: '#e0e3e8',
      primaryForeground: '#101418',
      accent: '#8ecff2',
      success: '#7dd69a',
      danger: '#ffb4ab',
    },
  };
  try {
    const saved = await pc.post('/trpc/theme.save', {
      data: { name: 'Vecchio', base: 'ink', values: legacy },
      headers: json,
    });
    expect(saved.ok()).toBe(true);
    await page.reload();
    await page.getByRole('button', { name: 'Modifica Vecchio' }).click();
    const editor = page.getByRole('form', { name: 'Modifica tema' });
    await expect(editor.locator('details')).toHaveAttribute('open', '');
    await expect(editor.getByText('manuale', { exact: true })).toHaveCount(12);
    await expect(role(editor, 'Accento')).toHaveValue('#8ecff2');
    await editor.getByRole('button', { name: 'Salva' }).click();
    await expect(editor).toBeHidden();
    await expect(page.getByRole('radio', { name: 'Vecchio', exact: true })).toBeChecked();
    // The colors did not move.
    await expect.poll(() => rootVar(page, '--accent')).toBe('rgb(142, 207, 242)');
  } finally {
    await deleteCustomThemes(pc);
  }
});

test('Angoli scales the surface and panel radius, leaves pills alone and persists per device', async ({ page }) => {
  const surface = page.locator('[data-page-surface]');
  const panel = page.locator('[data-panel]').first();
  const rail = page.getByRole('navigation', { name: 'Zone' });
  const standard = { surface: await radiusOf(surface), panel: await radiusOf(panel), rail: await radiusOf(rail) };

  await page.getByRole('toolbar', { name: 'Angoli' }).getByRole('button', { name: 'Netti' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-radius', 'sharp');
  expect(px(await radiusOf(surface))).toBeLessThan(px(standard.surface));
  expect(px(await radiusOf(panel))).toBeLessThan(px(standard.panel));
  expect(await radiusOf(rail)).toBe(standard.rail);

  await page.getByRole('toolbar', { name: 'Angoli' }).getByRole('button', { name: 'Morbidi' }).click();
  expect(px(await radiusOf(surface))).toBeGreaterThan(px(standard.surface));
  expect(px(await radiusOf(panel))).toBeGreaterThan(px(standard.panel));

  await page.getByRole('toolbar', { name: 'Angoli' }).getByRole('button', { name: 'Netti' }).click();
  await page.reload();
  await expect(page.getByRole('toolbar', { name: 'Angoli' }).getByRole('button', { name: 'Netti' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(px(await radiusOf(surface))).toBeLessThan(px(standard.surface));
  await page.getByRole('toolbar', { name: 'Angoli' }).getByRole('button', { name: 'Standard' }).click();
});

test('Vetro off removes the blur from the rail, the player and the activity ball with its panel, and persists', async ({
  page,
}) => {
  await page.goto('/desk/media');
  const rail = page.getByRole('navigation', { name: 'Zone' });
  const player = page.getByRole('region', { name: 'Player musicale' });
  await expect(player).toBeVisible();
  await expect(ballOf(page)).toBeVisible();
  const blurred = async () => [await blurOf(rail), await blurOf(player), await blurOf(ballOf(page))];
  expect((await blurred()).every((filter) => filter.startsWith('blur('))).toBe(true);

  await page.goto('/desk/settings/appearance');
  await page.getByRole('switch', { name: 'Vetro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-glass', 'off');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Vetro' })).toHaveAttribute('aria-checked', 'false');
  await page.goto('/desk/media');
  await expect(player).toBeVisible();
  expect(await blurred()).toEqual(['none', 'none', 'none']);
  await ballOf(page).click();
  expect(await blurOf(page.getByRole('dialog', { name: 'Attività in corso' }))).toBe('none');
  await page.keyboard.press('Escape');

  await page.goto('/desk/settings/appearance');
  await page.getByRole('switch', { name: 'Vetro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-glass', 'on');
});

// The worst a cover can do under text: white under light ink, black under dark ink, at the backdrop's own opacity.
async function worstCoverRatios(page: Page) {
  return page.evaluate(() => {
    const img = document.querySelector('.desk-backdrop img');
    if (!img) throw new Error('no cover');
    const alpha = Number(getComputedStyle(img).opacity);
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas');
    const pixel = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    const style = getComputedStyle(document.documentElement);
    const ground = pixel(style.getPropertyValue('--background'));
    const worst = ground.reduce((sum, channel) => sum + channel, 0) < 384 ? 255 : 0;
    const under = ground.map((channel) => Math.round(channel * (1 - alpha) + worst * alpha));
    const luminance = (rgb: number[]) => {
      const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (name: string) => {
      const a = luminance(pixel(style.getPropertyValue(name)));
      const b = luminance(under);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    return { alpha, foreground: ratio('--foreground'), muted: ratio('--muted-foreground') };
  });
}

test('Sfondo: plain has no glow or cover, Alone is the glow, Copertina adds the cover and keeps text at 4.5:1', async ({
  page,
}) => {
  const backdrop = page.locator('.desk-backdrop');
  const cover = backdrop.locator('img');
  const group = page.getByRole('toolbar', { name: 'Sfondo' });
  const glow = () => backdrop.evaluate((element) => getComputedStyle(element).backgroundImage);
  try {
    // The fake player is always playing, so the Media page has art in every mode but Tinta unita.
    await page.goto('/desk/settings/appearance');
    await group.getByRole('button', { name: 'Tinta unita' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-backdrop', 'plain');
    expect(await glow()).toBe('none');
    await page.goto('/desk/media');
    await expect(cover).toHaveCount(1);
    await expect(cover).toBeHidden();

    await page.goto('/desk/settings/appearance');
    await group.getByRole('button', { name: 'Alone' }).click();
    expect(await glow()).toContain('radial-gradient');
    await expect(cover).toHaveCount(0);

    await group.getByRole('button', { name: 'Copertina' }).click();
    await expect(cover).toBeVisible();
    for (const theme of ['Scuro', 'Chiaro', 'Muschio', 'Pietra']) {
      await chooseTheme(page, theme);
      const { alpha, foreground, muted } = await worstCoverRatios(page);
      expect(alpha, theme).toBeGreaterThan(0);
      expect(foreground, `${theme} text`).toBeGreaterThanOrEqual(4.5);
      expect(muted, `${theme} secondary text`).toBeGreaterThanOrEqual(4.5);
    }
    await chooseTheme(page, 'Scuro');

    // Nothing plays: the cover is gone and the glow remains, as with Alone.
    await page.request.post(`${SERVER_URL}/__fake/player`, { data: { gone: true } });
    await expect(cover).toHaveCount(0);
    expect(await glow()).toContain('radial-gradient');
    await page.reload();
    await expect(group.getByRole('button', { name: 'Copertina' })).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await restoreDesktop(page.request);
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
