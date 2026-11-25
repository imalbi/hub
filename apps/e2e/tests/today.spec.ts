import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { clean } from './calendar-data.ts';

// Oggi in four sizes (step 66, board P2). Thursday 19 November 2026, so tomorrow is "venerdì 20".
const NOW = new Date('2026-11-19T10:00:00');
const json = { 'content-type': 'application/json' };
const today = (page: Page) => page.locator('[data-widget="today"]');

async function placeToday(pc: APIRequestContext, size: string) {
  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: [{ widget: 'today', size, x: 0, y: 0 }] },
    headers: json,
  });
}

async function open(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.goto('/desk');
  await expect(today(page)).toBeVisible();
}

test.afterEach(async ({ pc }) => clean(pc));

test('every size fits its cell without scrolling or clipping', async ({ page, pc }) => {
  for (const day of ['2026-11-19', '2026-11-20'])
    for (const title of ['Dentista', 'Riunione', 'Corso', 'Visita'])
      await pc.post('/trpc/calendar.add', { data: { title, day, start: '09:00' }, headers: json });
  for (const text of ['Prima nota', 'Seconda nota', 'Terza nota'])
    await pc.post('/trpc/notes.add', { data: { text, forDay: '2026-11-19' }, headers: json });
  for (const size of ['medium', 'large', 'wide', 'full']) {
    await placeToday(pc, size);
    await open(page);
    await expect(today(page)).toHaveAttribute('data-size', size);
    const panel = today(page).locator('[data-panel]').first();
    const fits = await panel.evaluate(
      (element) => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth,
    );
    expect(fits, size).toBe(true);
  }
});

test('Esteso adds tomorrow, Largo does not; Aggiungi under tomorrow preselects Domani', async ({ page, pc }) => {
  await placeToday(pc, 'full');
  await open(page);
  const tomorrow = today(page).getByRole('heading', { name: 'Domani, venerdì 20' });
  await expect(tomorrow).toHaveCount(1);
  const lines = today(page).getByRole('list', { name: 'Righe di domani' });
  await expect(lines.getByText('Nessun evento tuo')).toBeVisible();
  await today(page).getByRole('button', { name: 'Aggiungi un post-it per domani' }).click();
  const capture = page.getByRole('dialog', { name: 'Nuovo post-it' });
  await expect(capture.getByRole('button', { name: 'Domani' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await placeToday(pc, 'wide');
  await open(page);
  await expect(today(page).getByRole('heading', { name: /^Domani/ })).toHaveCount(0);
});

test('Medio cuts the lines by count: two rows and "e altre N"', async ({ page, pc }) => {
  for (const title of ['Dentista', 'Riunione', 'Corso'])
    await pc.post('/trpc/calendar.add', { data: { title, day: '2026-11-19', start: '09:00' }, headers: json });
  await placeToday(pc, 'medium');
  await open(page);
  // The example module contributes one additional line when enabled.
  const lines = today(page).getByRole('list', { name: 'Righe di oggi' });
  await expect(lines.getByRole('link')).toHaveCount(2);
  await expect(lines.getByText(process.env.HUB_EXAMPLE_MODULES === '1' ? 'e altre 2' : 'e altre 1')).toBeVisible();
});

test('a long event in Medio ends in an ellipsis at 4K', async ({ page, pc }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  const title = 'Appuntamento ' + 'M'.repeat(100);
  expect(
    (await pc.post('/trpc/calendar.add', { data: { title, day: '2026-11-19', start: '09:00' }, headers: json })).ok(),
  ).toBe(true);
  await placeToday(pc, 'medium');
  await open(page);
  const row = today(page).getByRole('link', { name: new RegExp(title) });
  const text = row.locator('.truncate');
  await expect(text).toBeVisible();
  expect(
    await text.evaluate((element) => ({
      overflowing: element.scrollWidth > element.clientWidth,
      ellipsis: getComputedStyle(element).textOverflow === 'ellipsis',
      textRun: Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('Appuntamento'),
      ),
    })),
  ).toEqual({ overflowing: true, ellipsis: true, textRun: true });
});

test('every row with a link is one link, reached once by Tab', async ({ page, pc }) => {
  await pc.post('/trpc/calendar.add', {
    data: { title: 'Dentista', day: '2026-11-19', start: '09:00' },
    headers: json,
  });
  await pc.post('/trpc/calendar.add', {
    data: { title: 'Riunione', day: '2026-11-19', start: '10:00' },
    headers: json,
  });
  await placeToday(pc, 'wide');
  await open(page);
  const links = today(page).getByRole('list', { name: 'Righe di oggi' }).getByRole('link');
  await expect(links.filter({ hasText: 'Riunione' })).toHaveCount(1);
  await expect(links.filter({ hasText: 'Dentista' })).toHaveCount(1);
  const count = await links.count();
  expect(count).toBeGreaterThanOrEqual(2);
  const names = await links.evaluateAll((items) => items.map((item) => item.textContent));
  await links.first().focus();
  const reached = [];
  for (let index = 0; index < count; index++) {
    reached.push(await page.evaluate(() => document.activeElement?.textContent));
    await page.keyboard.press('Tab');
  }
  expect(reached).toEqual(names);
});

test('Oggi has no reserved header column without a contributor and renders an active contribution', async ({
  page,
  pc,
}) => {
  await placeToday(pc, 'wide');
  await open(page);
  const header = today(page).locator('[data-today-header]');
  if (process.env.HUB_EXAMPLE_MODULES === '1') {
    await expect(header).toHaveText('Contributo di esempio');
    await page.route('**/trpc/modules.enabled*', (route) =>
      route.fulfill({ json: { result: { data: ['notes', 'calendar'] } } }),
    );
    await page.reload();
  }
  await expect(header).toHaveCount(0);
  await expect(today(page).getByText(/\d{2}:\d{2}/)).toBeVisible();
});
