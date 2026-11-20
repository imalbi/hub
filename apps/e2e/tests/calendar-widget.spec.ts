import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { clean, seed, seedShifts } from './calendar-data.ts';

const json = { 'content-type': 'application/json' };
const widget = (page: Page) => page.locator('[data-widget="calendar"]');
const panel = (page: Page) => widget(page).locator('section').first();

async function placeCalendar(pc: APIRequestContext, size: 'small' | 'medium' | 'large') {
  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: [{ widget: 'calendar', size, x: 0, y: 0 }] },
    headers: json,
  });
}

test.afterEach(async ({ pc }) => clean(pc));

test('B1 & W2: Piccolo shows next timed event excluding shifts, falls back to untimed day, and handles empty', async ({
  page,
  pc,
}) => {
  await seed(pc);
  await seedShifts(pc);
  await placeCalendar(pc, 'small');
  await page.clock.setFixedTime(new Date('2026-11-19T13:00:00'));
  await page.goto('/desk');
  const small = panel(page);
  await expect(small.getByRole('heading', { name: 'Prossimo' })).toBeVisible();
  await expect(small.getByText('Oggi', { exact: true })).toBeVisible();
  await expect(small.locator('[data-readout]')).toHaveText('15:00');
  await expect(small.locator('[data-readout]')).toHaveCSS('font-family', /JetBrains Mono/);
  await expect(small.getByText('Riunione', { exact: true })).toBeVisible();
  await expect(small.getByText(/Persona A|Turno/)).toHaveCount(0);
  expect(await small.getByRole('button').count()).toBeLessThanOrEqual(1);
  await small.click();
  await expect(page).toHaveURL(/\/desk\/calendar/);

  await clean(pc);
  await placeCalendar(pc, 'small');
  await pc.post('/trpc/calendar.add', {
    data: { title: 'Scadenza esempio', day: '2026-11-20' },
    headers: json,
  });
  await page.clock.setFixedTime(new Date('2026-11-19T13:00:00'));
  await page.goto('/desk');
  await expect(small.getByText('Domani', { exact: true })).toBeVisible();
  await expect(small.getByText('Scadenza esempio', { exact: true })).toBeVisible();

  await clean(pc);
  await placeCalendar(pc, 'small');
  await page.goto('/desk');
  await expect(small.getByText('Niente in programma', { exact: true })).toBeVisible();
});

test('B2: Medio shows 3 rows and Grande 6 rows in date order without shifts', async ({ page, pc }) => {
  await seed(pc);
  await seedShifts(pc);
  await page.clock.setFixedTime(new Date('2026-11-16T08:00:00'));

  await placeCalendar(pc, 'medium');
  await page.goto('/desk');
  const medium = panel(page);
  await expect(medium.getByRole('heading', { name: 'Prossimi giorni' })).toBeVisible();
  await expect(medium.getByRole('link', { name: 'Apri Calendario', exact: true })).toHaveAttribute(
    'href',
    '/desk/calendar',
  );
  await expect(medium.getByRole('listitem')).toHaveCount(3);
  expect(
    await medium
      .locator('li a')
      .evaluateAll((links) => links.map((link) => [...link.children].map((child) => child.textContent?.trim() ?? ''))),
  ).toEqual([
    ['Oggi', 'Post-it', 'Riprendere step 55'],
    ['gio 19', 'Evento', '09:00 Visita'],
    ['gio 19', 'Evento', '12:30 Pranzo'],
  ]);
  await expect(medium.getByText(/Persona A|Persona B|Turno/)).toHaveCount(0);

  await placeCalendar(pc, 'large');
  await page.goto('/desk');
  const large = panel(page);
  await expect(large.getByRole('listitem')).toHaveCount(6);
  expect(
    await large
      .locator('li a')
      .evaluateAll((links) => links.map((link) => [...link.children].map((child) => child.textContent?.trim() ?? ''))),
  ).toEqual([
    ['Oggi', 'Post-it', 'Riprendere step 55'],
    ['gio 19', 'Evento', '09:00 Visita'],
    ['gio 19', 'Evento', '12:30 Pranzo'],
    ['gio 19', 'Evento', '15:00 Riunione'],
    ['gio 19', 'Evento', '18:00 Corso'],
    ['sab 21', 'Evento', '20:00 Cena da Marco'],
  ]);
  await expect(large.getByText(/Persona A|Persona B|Turno/)).toHaveCount(0);
});

test('W1 & W3: every size fits at 4K and 1080p and Grande cuts 8 entries to 6 with altri 2 impegni', async ({
  page,
  pc,
}) => {
  await seed(pc);
  await pc.post('/trpc/calendar.add', {
    data: { title: 'Esame', day: '2026-11-22', start: '10:00' },
    headers: json,
  });
  await pc.post('/trpc/calendar.add', {
    data: { title: 'Consegna', day: '2026-11-24', start: '17:00' },
    headers: json,
  });
  await page.clock.setFixedTime(new Date('2026-11-16T08:00:00'));

  for (const size of ['small', 'medium', 'large'] as const) {
    await placeCalendar(pc, size);
    for (const viewport of [
      { width: 3840, height: 2160 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/desk');
      const card = panel(page);
      await expect(card.getByRole('heading')).toBeVisible();
      await expect(card.getByText(size === 'small' ? 'Visita' : 'Riprendere step 55')).toBeVisible();
      if (size === 'large') {
        await expect(card.getByRole('listitem')).toHaveCount(6);
        await expect(card.getByText('altri 2 impegni', { exact: true })).toBeVisible();
      }
      const fits = await card.evaluate((el) => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth);
      expect(fits, `${size} at ${viewport.width}x${viewport.height}`).toBe(true);
    }
  }
});
