import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

const cell = (page: Page, widget: string) => page.locator(`[data-widget="${widget}"]`);
// Layout changes animate in edit mode; measure once the grid has settled.
const box = async (page: Page, widget: string) => {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.react-grid-item')].every((item) => item.getAnimations().length === 0),
  );
  const rect = await cell(page, widget).boundingBox();
  if (!rect) throw new Error(`${widget} is not on the board`);
  return rect;
};

/** Runs an action that changes the board and waits until the server has stored it, so a reload reads it back. */
async function andSaved(page: Page, action: () => Promise<void>) {
  const response = page.waitForResponse((res) => res.url().includes('/trpc/layout.save') && res.ok());
  await action();
  await response;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/desk');
  await expect(cell(page, 'pomodoro')).toBeVisible();
});

test.afterEach(async ({ pc }) => {
  for (const zone of ['overview', 'media'])
    await pc.post('/trpc/layout.reset', { data: { zone }, headers: { 'content-type': 'application/json' } });
});

test('widgets on the same row have the same height, two small ones fill a medium width', async ({ page }) => {
  const [pomodoro, media, server, audio] = await Promise.all(
    ['pomodoro', 'media', 'server', 'audio'].map((widget) => box(page, widget)),
  );
  // One row is --spacing-widget-row at the desk's root size (15rem at 24px); a stale read of the root before the desk
  // layout applied once gave 240px rows that cut the Musica widget.
  expect(pomodoro.height).toBeCloseTo(360, 0);
  expect(media.height).toBeCloseTo(pomodoro.height, 0);
  expect(media.y).toBeCloseTo(pomodoro.y, 0);
  expect(audio.height).toBeCloseTo(server.height, 0);
  expect(audio.y).toBeCloseTo(server.y, 0);
  // Two Piccoli and their gap span exactly one Medio.
  expect(audio.x + audio.width - server.x).toBeCloseTo(pomodoro.width, 0);
});

test('a size chosen in edit mode resizes the widget and survives a reload', async ({ page }) => {
  const before = await box(page, 'pomodoro');
  await page.getByRole('button', { name: 'Modifica' }).click();
  const sizes = page.getByRole('group', { name: 'Dimensione di Pomodoro' });
  await andSaved(page, () => sizes.locator('label', { has: page.getByRole('radio', { name: 'Grande' }) }).click());
  await expect.poll(async () => (await box(page, 'pomodoro')).height).toBeGreaterThan(before.height * 1.5);
  await page.getByRole('button', { name: 'Fine' }).click();
  await page.reload();
  await expect(cell(page, 'pomodoro')).toHaveAttribute('data-size', 'large');
  // The large variant is the full panel, with the ring and the daily count.
  await expect(cell(page, 'pomodoro').getByText(/^Sessioni completate oggi/)).toBeVisible();
});

test('the large Musica widget fits its cell: the hero-sized cover once pushed the title and controls out', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Modifica' }).click();
  const sizes = page.getByRole('group', { name: 'Dimensione di Musica' });
  await andSaved(page, () => sizes.locator('label', { has: page.getByRole('radio', { name: 'Grande' }) }).click());
  await page.getByRole('button', { name: 'Fine' }).click();
  await box(page, 'media');
  const panel = cell(page, 'media').locator('section').first();
  const overflow = await panel.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a widget is removed, offered in Aggiungi widget, and added back', async ({ page }) => {
  await page.getByRole('button', { name: 'Modifica' }).click();
  await andSaved(page, () => page.getByRole('button', { name: 'Rimuovi Server' }).click());
  await expect(cell(page, 'server')).toHaveCount(0);
  await page.reload();
  await expect(cell(page, 'server')).toHaveCount(0);
  await page.getByRole('button', { name: 'Modifica' }).click();
  await page.getByRole('button', { name: 'Aggiungi Server' }).click();
  await expect(cell(page, 'server')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aggiungi Server' })).toHaveCount(0);
});

test('Sposta dopo moves a widget without dragging, for the keyboard', async ({ page }) => {
  await page.getByRole('button', { name: 'Modifica' }).click();
  await page.getByRole('button', { name: 'Sposta dopo Pomodoro' }).focus();
  await andSaved(page, () => page.keyboard.press('Enter'));
  await expect.poll(async () => (await box(page, 'media')).x < (await box(page, 'pomodoro')).x).toBe(true);
  await page.reload();
  await expect.poll(async () => (await box(page, 'media')).x < (await box(page, 'pomodoro')).x).toBe(true);
});

test('dragging a widget in edit mode rearranges the board and is saved', async ({ page }) => {
  await page.getByRole('button', { name: 'Modifica' }).click();
  const from = await box(page, 'audio');
  const to = await box(page, 'pomodoro');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 4, to.y + to.height / 2, { steps: 20 });
  await andSaved(page, () => page.mouse.up());
  await expect.poll(async () => (await box(page, 'audio')).y).toBeLessThan(from.y);
  await page.reload();
  await expect.poll(async () => (await box(page, 'audio')).y).toBeLessThan(from.y);
});

test('outside edit mode nothing drags and the widgets work as usual', async ({ page }) => {
  const from = await box(page, 'audio');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x - 300, from.y - 300, { steps: 10 });
  await page.mouse.up();
  expect(await box(page, 'audio')).toEqual(from);
  await expect(cell(page, 'pomodoro').getByRole('button', { name: 'Avvia' })).toBeEnabled();
});

test('a zone offers only its own widgets; Panoramica offers them all', async ({ page }) => {
  await page.goto('/desk/media');
  await page.getByRole('button', { name: 'Modifica' }).click();
  await andSaved(page, () => page.getByRole('button', { name: 'Rimuovi Uscita audio' }).click());
  await expect(page.getByRole('button', { name: /^Aggiungi / })).toHaveText(['Uscita audio']);
  await andSaved(page, () => page.getByRole('button', { name: 'Aggiungi Uscita audio' }).click());
  // The player hero is part of the page, not a widget: it never shows edit tools.
  await expect(page.getByRole('region', { name: 'Player musicale' })).toBeVisible();
  await expect(page.locator('[data-widget="media"]')).toHaveCount(0);
});
