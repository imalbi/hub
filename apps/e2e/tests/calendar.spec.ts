import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clean, seed } from './calendar-data.ts';
import { RUN_TMP } from './hosts.ts';
import { legiblePlan } from './study-fixtures.ts';
import { expect, test } from './fixtures.ts';
import { answerQueries } from './desktop.ts';

const json = { 'content-type': 'application/json' };
// Sunday 15 November 2026, 10:00: the month grid starts on Monday 26 October.
const NOW = new Date(2026, 10, 15, 10, 0);

test.beforeEach(async ({ page, pc }) => {
  await page.clock.install({ time: NOW });
  await seed(pc);
});
test.afterEach(async ({ pc }) => clean(pc));

test('day lines place calendar bands and keep nearby captions apart', async ({ page, pc }) => {
  await page.clock.setSystemTime(new Date(2026, 10, 15, 9, 0));
  await page.setViewportSize({ width: 3840, height: 2160 });
  await answerQueries(page, {
    'pomodoro.today': [
      {
        startedAt: new Date(2026, 10, 15, 8, 30).getTime(),
        endedAt: new Date(2026, 10, 15, 8, 55).getTime(),
        tag: null,
      },
    ],
  });
  await pc.post('/trpc/calendar.add', {
    data: { title: 'Turno prova', day: '2026-11-15', start: '10:00', end: '13:00' },
  });
  await pc.post('/trpc/calendar.add', { data: { title: 'Colloquio prova', day: '2026-11-15', start: '10:30' } });
  for (const path of ['/desk', '/desk/studio']) {
    await page.goto(path);
    const ruler = page.locator('[data-day-ruler]');
    const band = ruler.locator('[data-day-event][aria-label="Turno prova"]');
    const interview = ruler.locator('[data-day-event][aria-label="Colloquio prova"]');
    await expect(band).toBeVisible();
    await expect(interview).toBeVisible();
    const r = await ruler.boundingBox();
    const b = await band.boundingBox();
    const a = await ruler.locator('[data-day-caption]').getByText('10:00 Turno prova').boundingBox();
    const c = await ruler.locator('[data-day-caption]').getByText('10:30 Colloquio prova').boundingBox();
    const dentist = await ruler.locator('[data-day-caption]').getByText('16:30 Dentista').boundingBox();
    if (!r || !b || !a || !c || !dentist) throw new Error('missing day line box');
    expect(Math.abs((b.x - r.x) / r.width - 4 / 18)).toBeLessThan(0.005);
    expect(Math.abs(b.width / r.width - 3 / 18)).toBeLessThan(0.005);
    expect(a.x + a.width <= c.x || c.x + c.width <= a.x || a.y + a.height <= c.y || c.y + c.height <= a.y).toBe(true);
    expect(a.y).toBe(dentist.y);
    expect(c.y).toBeGreaterThan(a.y);
  }
  await pc.post('/trpc/calendar.add', {
    data: { title: 'Terzo appuntamento molto lungo', day: '2026-11-15', start: '10:31' },
  });
  await pc.post('/trpc/calendar.add', { data: { title: 'Fine giornata', day: '2026-11-15', start: '23:55' } });
  await page.goto('/desk');
  const captions = page.locator('[data-day-caption]');
  await expect(captions.getByText('10:31', { exact: true })).toBeVisible();
  const edge = await captions.getByText('23:55 Fine giornata').boundingBox();
  const ruler = await page.locator('[data-day-ruler]').boundingBox();
  if (!edge || !ruler) throw new Error('missing edge caption or ruler');
  expect(edge.x + edge.width).toBeLessThanOrEqual(ruler.x + ruler.width + 0.1);
  const boxes = await captions.evaluateAll((nodes) =>
    nodes.map((node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
  expect(new Set(boxes.map((box) => box.y)).size).toBeLessThanOrEqual(2);
  for (const [index, a] of boxes.entries())
    for (const b of boxes.slice(index + 1))
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
});

test('the rail opens the month: events, a post-it, the chosen day and the months', async ({ page }) => {
  await page.goto('/desk');
  await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Calendario' }).click();
  const month = page.getByRole('region', { name: 'novembre 2026' });
  await expect(month).toBeVisible();
  // The post-it of the 16th and the dentist of today are chips on their days.
  await expect(month.locator('[data-day="2026-11-16"]').getByText('Riprendere step 55')).toBeVisible();
  const today = month.locator('[data-day="2026-11-15"]');
  if (process.env.HUB_EXAMPLE_MODULES === '1') {
    await expect(today.getByText('Senza orario esempio')).toBeVisible();
    await expect(today.getByLabel('Altri 2 il domenica 15 novembre')).toBeVisible();
  } else {
    await expect(today.getByText('16:30 Dentista')).toBeVisible();
  }
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

test('Oggi orders shifts among events, after all-day events', async ({ page, pc }) => {
  for (const data of [
    { title: 'Tutto il giorno', day: '2026-11-15' },
    { title: 'Visita', day: '2026-11-15', start: '08:00' },
    { title: 'Turno', kind: 'shift', person: 'Persona A', day: '2026-11-15', start: '09:30', end: '17:00' },
  ])
    expect((await pc.post('/trpc/calendar.add', { data, headers: json })).ok()).toBe(true);
  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: [{ widget: 'today', size: 'full', x: 0, y: 0 }] },
    headers: json,
  });
  await page.goto('/desk');
  const lines = page.getByRole('list', { name: 'Righe di oggi' }).getByRole('link').filter({ hasText: 'Calendario' });
  await expect(lines).toHaveCount(4);
  await expect(lines).toContainText([
    'Tutto il giorno',
    '08:00 Visita',
    '09:30-17:00 Turno Persona A',
    '16:30 Dentista',
  ]);
});

test('Oggi shows a weekly shift except on a skipped occurrence', async ({ page, pc }) => {
  const response = await pc.post('/trpc/calendar.addSeries', {
    data: {
      title: 'Turno',
      kind: 'shift',
      person: 'Persona A',
      days: [{ weekday: 7, start: '09:30', end: '17:00' }],
      fromDay: '2026-11-15',
      untilDay: null,
    },
    headers: json,
  });
  expect(response.ok()).toBe(true);
  const { id } = (await response.json()).result.data;
  expect(
    (
      await pc.post('/trpc/calendar.editOccurrence', {
        data: { seriesId: id, day: '2026-11-22', fields: null },
        headers: json,
      })
    ).ok(),
  ).toBe(true);
  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: [{ widget: 'today', size: 'full', x: 0, y: 0 }] },
    headers: json,
  });
  await page.goto('/desk');
  await expect(page.getByRole('link', { name: /09:30-17:00 Turno Persona A/ })).toBeVisible();
  await page.clock.setFixedTime(new Date(2026, 10, 22, 10));
  await page.reload();
  await expect(
    page.getByRole('list', { name: 'Righe di oggi' }).getByRole('link', { name: /Turno Persona A/ }),
  ).toHaveCount(0);
});

test('tomorrow with only a shift does not say there are no events', async ({ page, pc }) => {
  expect(
    (
      await pc.post('/trpc/calendar.add', {
        data: { title: 'Turno', kind: 'shift', person: 'Persona A', day: '2026-11-16', start: '09:30', end: '17:00' },
        headers: json,
      })
    ).ok(),
  ).toBe(true);
  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: [{ widget: 'today', size: 'full', x: 0, y: 0 }] },
    headers: json,
  });
  await page.goto('/desk');
  const lines = page.getByRole('list', { name: 'Righe di domani' });
  await expect(lines.getByRole('link', { name: /09:30-17:00 Turno Persona A/ })).toBeVisible();
  await expect(lines.getByText('Nessun evento tuo')).toHaveCount(0);
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
