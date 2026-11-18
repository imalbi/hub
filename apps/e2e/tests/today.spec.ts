import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { RUN_TMP } from './hosts.ts';
import { clean, setPlan } from './calendar-data.ts';
import { legiblePlan } from './study-fixtures.ts';

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

/** The legible plan active on its first day ("La foglia", 6 steps), with `done` of them ticked. */
async function studyOn(pc: APIRequestContext, done: number) {
  const db = new DatabaseSync(join(RUN_TMP, 'modules', 'study.db'));
  db.prepare("DELETE FROM progress WHERE plan_id IN ('example', '*')").run();
  db.close();
  const inbox = join(RUN_TMP, 'study', 'in-arrivo');
  await mkdir(inbox, { recursive: true });
  await writeFile(join(inbox, 'legible.json'), JSON.stringify(await legiblePlan()));
  expect((await pc.post('/trpc/study.activate', { data: { name: 'legible.json' } })).ok()).toBe(true);
  const steps = ['A01.m.1', 'A01.m.2', 'A01.p.1', 'A01.p.2', 'A01.p.3', 'A01.c.1'];
  for (const id of steps.slice(0, done))
    await pc.post('/trpc/study.setStep', { data: { key: 'example/A01', id, done: true }, headers: json });
}

async function open(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.goto('/desk');
  await expect(today(page)).toBeVisible();
}

test.afterEach(async ({ pc }) => clean(pc));

test('every size fits its cell without scrolling or clipping', async ({ page, pc }) => {
  // With weather data, as after a spec that sets a city: Grande overflowed with two rows of post-its (step 64 review).
  const weather = { name: 'Località esempio', temperature: 19, code: 1, min: 12, max: 23, stale: false };
  await page.route('**/trpc/weather.state*', (route) =>
    route.fulfill({ json: { result: { data: { configured: true, current: weather } } } }),
  );
  await studyOn(pc, 2);
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
    if (!fits) await page.screenshot({ path: `/tmp/hub66-overflow-${size}.png` });
    expect(fits, size).toBe(true);
  }
});

test('Studio says the day and its steps, and follows a tick on the Studio page', async ({ page, pc }) => {
  await studyOn(pc, 2);
  await placeToday(pc, 'wide');
  await open(page);
  const row = today(page).getByRole('link', { name: /G1 · La foglia/ });
  await expect(row).toContainText('Studio');
  await expect(row).toContainText('2 di 6 passi');
  await row.click();
  await expect(page).toHaveURL(/\/desk\/studio/);
  await page.getByRole('checkbox', { name: /Svolgi gli esercizi da 1 a 11/ }).click();
  await page.getByRole('link', { name: 'Panoramica' }).click();
  await expect(today(page).getByRole('link', { name: /G1 · La foglia/ })).toContainText('3 di 6 passi');
});

test('without an active plan there is no Studio row', async ({ page, pc }) => {
  const plans: Array<{ id: string }> = (await (await pc.get('/trpc/study.active')).json()).result.data;
  for (const { id } of plans) await setPlan(pc, id, false);
  try {
    await placeToday(pc, 'wide');
    await open(page);
    await expect(today(page).getByText('Studio', { exact: true })).toHaveCount(0);
  } finally {
    for (const { id } of plans) await setPlan(pc, id, true);
  }
});

test('Posta shows the unread count as one link', async ({ page, pc }) => {
  await placeToday(pc, 'wide');
  await open(page);
  const row = today(page).getByRole('link', { name: /3 non lette/ });
  await expect(row).toContainText('Posta');
  await expect(row).toHaveAttribute('href', '/desk/messaggi');
});

test('Esteso adds tomorrow, Largo does not; Aggiungi under tomorrow preselects Domani', async ({ page, pc }) => {
  await studyOn(pc, 0);
  await placeToday(pc, 'full');
  await open(page);
  const tomorrow = today(page).getByRole('heading', { name: 'Domani, venerdì 20' });
  await expect(tomorrow).toHaveCount(1);
  const lines = today(page).getByRole('list', { name: 'Righe di domani' });
  await expect(lines.getByRole('link', { name: /G2 ·/ })).toContainText(/\d+ pass[oi]/);
  await expect(lines.getByText('Nessun evento tuo')).toBeVisible();
  await today(page).getByRole('button', { name: 'Aggiungi un post-it per domani' }).click();
  const capture = page.getByRole('dialog', { name: 'Nuovo post-it' });
  await expect(capture.getByRole('button', { name: 'Domani' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await placeToday(pc, 'wide');
  await open(page);
  await expect(today(page).getByRole('heading', { name: /^Domani/ })).toHaveCount(0);
});

test('weather with no data says so and links to its settings', async ({ page, pc }) => {
  // `weather.state` goes over its own unbatched link (`main.tsx`): the answer is one object, not a batch array.
  await page.route('**/trpc/weather.state*', (route) =>
    route.fulfill({ json: { result: { data: { configured: false, current: null } } } }),
  );
  for (const size of ['medium', 'wide']) {
    await placeToday(pc, size);
    await open(page);
    await expect(today(page).getByText(/Meteo non disponibile/)).toBeVisible();
    await expect(today(page).getByRole('link', { name: 'Imposta la città' })).toHaveAttribute(
      'href',
      '/desk/settings/weather',
    );
  }
});

test('weather with a location but no reading has no settings link', async ({ page, pc }) => {
  await page.route('**/trpc/weather.state*', (route) =>
    route.fulfill({ json: { result: { data: { configured: true, current: null } } } }),
  );
  for (const size of ['medium', 'wide']) {
    await placeToday(pc, size);
    await open(page);
    await expect(today(page).getByText('Meteo non raggiungibile')).toBeVisible();
    await expect(today(page).getByRole('link', { name: 'Imposta la città' })).toHaveCount(0);
  }
});

test('Medio cuts the lines by count: two rows and "e altre N"', async ({ page, pc }) => {
  await studyOn(pc, 0);
  for (const title of ['Dentista', 'Riunione'])
    await pc.post('/trpc/calendar.add', { data: { title, day: '2026-11-19', start: '09:00' }, headers: json });
  await placeToday(pc, 'medium');
  await open(page);
  // Studio, Posta and the two events: four lines.
  const lines = today(page).getByRole('list', { name: 'Righe di oggi' });
  await expect(lines.getByRole('link')).toHaveCount(2);
  await expect(lines.getByText('e altre 2')).toBeVisible();
});

test('every row with a link is one link, reached once by Tab', async ({ page, pc }) => {
  await studyOn(pc, 0);
  await placeToday(pc, 'wide');
  await open(page);
  const links = today(page).getByRole('list', { name: 'Righe di oggi' }).getByRole('link');
  // Lines arrive per module; wait for both before reading the list, or a late one shifts the order.
  await expect(links.filter({ hasText: 'G1 · La foglia' })).toHaveCount(1);
  await expect(links.filter({ hasText: '3 non lette' })).toHaveCount(1);
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
