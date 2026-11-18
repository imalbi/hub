import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clean, seed } from './calendar-data.ts';
import { RUN_TMP } from './hosts.ts';
import { legiblePlan } from './study-fixtures.ts';
import { expect, test } from './fixtures.ts';

const json = { 'content-type': 'application/json' };
// Sunday 15 November 2026, 10:00: the month grid starts on Monday 26 October.
const NOW = new Date(2026, 10, 15, 10, 0);

test.beforeEach(async ({ page, pc }) => {
  await page.clock.install({ time: NOW });
  await seed(pc);
});
test.afterEach(async ({ pc }) => clean(pc));

test('the rail opens the month: events, a post-it, the chosen day and the months', async ({ page }) => {
  await page.goto('/desk');
  await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Calendario' }).click();
  const month = page.getByRole('region', { name: 'novembre 2026' });
  await expect(month).toBeVisible();
  // The post-it of the 16th and the dentist of today are chips on their days.
  await expect(month.locator('[data-day="2026-11-16"]').getByText('Riprendere step 55')).toBeVisible();
  await expect(month.locator('[data-day="2026-11-15"]').getByText('16:30 Dentista')).toBeVisible();
  // Today is chosen at first and the panel names it.
  const panel = page.getByRole('complementary', { name: 'domenica 15 novembre' });
  await expect(panel.getByText('16:30 · Evento')).toBeVisible();
  // A day with more events than fit shows its first ones and ends in "+N" (at 1920 a cell holds two rows: one chip and "+3").
  const busy = month.locator('[data-day="2026-11-19"]');
  await expect(busy.getByRole('button', { name: 'Modifica evento: Visita' })).toBeVisible();
  await expect(busy.getByLabel('Altri 3 il giovedì 19 novembre')).toBeVisible();
  // A click in the cell's corner: the middle may land on a chip, which opens the event.
  await month.getByRole('button', { name: 'giovedì 19 novembre' }).click({ position: { x: 20, y: 6 } });
  const chosen = page.getByRole('complementary', { name: 'giovedì 19 novembre' });
  await expect(chosen.getByText('Corso')).toBeVisible();
  await expect(chosen.getByText('Riunione')).toBeVisible();
  await page.getByRole('button', { name: 'Mese successivo' }).click();
  await expect(page.getByRole('region', { name: 'dicembre 2026' })).toBeVisible();
  await page.getByRole('button', { name: 'Oggi' }).click();
  await expect(page.getByRole('region', { name: 'novembre 2026' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'domenica 15 novembre' })).toBeVisible();
});

test('Nuovo evento takes an Italian day, saves with Invio; edit, Elimina and Annulla', async ({ page }) => {
  await page.goto('/desk/calendar');
  await page.getByRole('button', { name: 'Nuovo evento' }).click();
  const card = page.getByRole('dialog', { name: 'Nuovo evento' });
  const title = card.getByRole('textbox', { name: 'Titolo' });
  await expect(title).toBeFocused();
  await title.fill('Fisioterapia');
  await card.getByRole('button', { name: /^Scegli un giorno/ }).click();
  await card.getByRole('textbox', { name: 'Oppure scrivi un giorno' }).fill('venerdì');
  await page.keyboard.press('Enter');
  await expect(card.getByRole('button', { name: /^Scegli un giorno: venerdì 20 novembre/ })).toBeVisible();
  await card.getByLabel('Dalle').fill('08:15');
  await card.getByLabel('Alle', { exact: true }).fill('09:00');
  await title.press('Enter');
  await expect(card).toHaveCount(0);
  const month = page.getByRole('region', { name: 'novembre 2026' });
  await expect(month.locator('[data-day="2026-11-20"]').getByText('08:15 Fisioterapia')).toBeVisible();
  // Saving selects the day it landed on.
  await expect(page.getByRole('complementary', { name: 'venerdì 20 novembre' })).toBeVisible();

  await month.getByRole('button', { name: 'Modifica evento: Fisioterapia' }).click();
  const edit = page.getByRole('dialog', { name: 'Fisioterapia' });
  await edit.getByRole('textbox', { name: 'Titolo' }).fill('Fisioterapia, studio');
  await edit.getByRole('button', { name: 'Salva' }).click();
  await expect(month.getByText('08:15 Fisioterapia, studio')).toBeVisible();

  await month.getByRole('button', { name: 'Modifica evento: Fisioterapia, studio' }).click();
  await page.getByRole('dialog', { name: 'Fisioterapia, studio' }).getByRole('button', { name: 'Elimina' }).click();
  await expect(month.getByText('Fisioterapia, studio')).toHaveCount(0);
  await page.getByRole('button', { name: 'Annulla: Fisioterapia, studio' }).click();
  await expect(month.getByText('08:15 Fisioterapia, studio')).toBeVisible();
});

test('an end before the start is not saved', async ({ page }) => {
  await page.goto('/desk/calendar');
  await page.getByRole('button', { name: 'Nuovo evento' }).click();
  const card = page.getByRole('dialog', { name: 'Nuovo evento' });
  await card.getByRole('textbox', { name: 'Titolo' }).fill('Prova');
  await card.getByLabel('Dalle').fill('10:00');
  await card.getByLabel('Alle', { exact: true }).fill('09:00');
  await expect(card.getByText("L'ora di fine deve essere dopo quella di inizio")).toBeVisible();
  await expect(card.getByRole('button', { name: 'Salva' })).toBeDisabled();
});

test("Oggi lists today's own events, not a shift", async ({ page, pc }) => {
  // A shift of today: someone else's day, so it stays off Oggi (removed by `clean` like the other events).
  await pc.post('/trpc/calendar.add', {
    data: { title: 'Turno', kind: 'shift', person: 'Persona A', day: '2026-11-15', start: '06:00', end: '14:00' },
    headers: json,
  });
  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: [{ widget: 'today', size: 'wide', x: 0, y: 0 }] },
    headers: json,
  });
  await page.goto('/desk');
  const today = page.getByRole('region', { name: 'Oggi', exact: true });
  // Step 66: one Oggi row per own event, chip "Calendario".
  const events = today.getByRole('link').filter({ hasText: 'Calendario' });
  await expect(events).toHaveCount(1);
  await expect(events).toContainText('16:30 Dentista');
});

test('Studio days slide from today, one a day, and open Studio', async ({ page, pc }) => {
  const inbox = join(RUN_TMP, 'study', 'in-arrivo');
  await mkdir(inbox, { recursive: true });
  await writeFile(join(inbox, 'calendar.json'), JSON.stringify(await legiblePlan()));
  expect((await pc.post('/trpc/study.activate', { data: { name: 'calendar.json' } })).ok()).toBe(true);
  await page.goto('/desk/calendar');
  const month = page.getByRole('region', { name: 'novembre 2026' });
  // The current day (La foglia) is today; the next open day is tomorrow, not today.
  await expect(month.locator('[data-day="2026-11-15"]').getByRole('button', { name: /La foglia/ })).toBeVisible();
  await expect(month.locator('[data-day="2026-11-14"]').getByRole('button')).toHaveCount(1);
  await expect(month.locator('[data-day="2026-11-16"]').getByRole('button')).toHaveCount(2);
  await expect(
    page.getByRole('complementary', { name: 'domenica 15 novembre' }).getByText('Studio', { exact: true }),
  ).toBeVisible();
  await month
    .locator('[data-day="2026-11-15"]')
    .getByRole('button', { name: /La foglia/ })
    .click();
  await expect(page).toHaveURL(/\/desk\/studio$/);
});

test('weekly shifts support editing a day, editing the series and removing one occurrence', async ({ page }) => {
  await page.goto('/desk/calendar');
  await page.getByRole('button', { name: 'Nuovo evento' }).click();
  const card = page.getByRole('dialog', { name: 'Nuovo evento' });
  await card.getByRole('switch', { name: 'Turno' }).click();
  await card.getByRole('textbox', { name: 'Persona' }).fill('Persona A');
  await card.getByLabel('Dalle', { exact: true }).fill('09:00');
  await card.getByLabel('Alle', { exact: true }).fill('13:00');
  await card.getByRole('switch', { name: 'Ripeti ogni settimana' }).click();
  await card.getByRole('button', { name: 'Domenica', exact: true }).click();
  for (const name of ['Lunedì', 'Mercoledì', 'Venerdì']) await card.getByRole('button', { name, exact: true }).click();
  await card.getByLabel('Mercoledì, alle').fill('17:00');
  await card.getByLabel('Venerdì, dalle').fill('10:00');
  await card.getByLabel('Dal', { exact: true }).fill('2026-11-16');
  await card.getByRole('button', { name: 'Salva' }).click();
  await expect(card).toHaveCount(0);
  const month = page.getByRole('region', { name: 'novembre 2026' });
  for (const day of ['16', '18', '20'])
    await expect(month.locator(`[data-day="2026-11-${day}"]`).getByText('Persona A')).toHaveCount(0);
  await page.getByRole('toolbar', { name: 'Vista' }).getByRole('button', { name: 'Settimana' }).click();
  await page.getByRole('button', { name: 'Settimana successiva' }).click();
  const monday = page.getByRole('region', { name: 'lunedì 16 novembre' });
  const wednesday = page.getByRole('region', { name: 'mercoledì 18 novembre' });
  const friday = page.getByRole('region', { name: 'venerdì 20 novembre' });
  await expect(monday.getByText('Turno 9-13')).toBeVisible();
  await expect(wednesday.getByText('Turno 9-17')).toBeVisible();
  await expect(friday.getByText('Turno 10-13')).toBeVisible();
  await monday.getByRole('button', { name: /Persona A/ }).click();
  const edit = page.getByRole('dialog', { name: 'Turno' });
  await expect(edit.getByRole('button', { name: 'Salva' })).toBeDisabled();
  await edit.getByRole('button', { name: 'Solo questo giorno' }).click();
  await edit.getByRole('textbox', { name: 'Persona' }).fill('Persona B');
  await edit.getByRole('button', { name: 'Salva' }).click();
  await expect(monday.getByText('Persona B')).toBeVisible();
  await page.getByRole('button', { name: 'Settimana successiva' }).click();
  await expect(page.getByRole('region', { name: 'lunedì 23 novembre' }).getByText('Persona A')).toBeVisible();
  await page
    .getByRole('region', { name: 'lunedì 23 novembre' })
    .getByRole('button', { name: /Persona A/ })
    .click();
  await edit.getByRole('button', { name: 'Tutta la serie' }).click();
  await edit.getByRole('textbox', { name: 'Persona' }).fill('Persona C');
  await edit.getByRole('button', { name: 'Salva' }).click();
  await expect(page.getByRole('region', { name: 'lunedì 23 novembre' }).getByText('Persona C')).toBeVisible();
  await page.getByRole('button', { name: 'Settimana precedente' }).click();
  await expect(monday.getByText('Persona B')).toBeVisible();
  await expect(wednesday.getByText('Persona C')).toBeVisible();
  await wednesday.getByRole('button', { name: /Persona C/ }).click();
  await edit.getByRole('button', { name: 'Solo questo giorno' }).click();
  await edit.getByRole('button', { name: 'Elimina' }).click();
  await expect(wednesday.getByText('Persona C')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settimana successiva' }).click();
  await expect(page.getByRole('region', { name: 'mercoledì 25 novembre' }).getByText('Persona C')).toBeVisible();
});
