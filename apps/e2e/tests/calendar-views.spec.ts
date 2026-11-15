import { clean, seed, seedShifts } from './calendar-data.ts';
import { expect, test } from './fixtures.ts';

const json = { 'content-type': 'application/json' };
// Sunday 15 November 2026, 10:00: the week is 9 to 15 November, the next one 16 to 22.
const NOW = new Date(2026, 10, 15, 10, 0);

test.beforeEach(async ({ page, pc }) => {
  await page.clock.install({ time: NOW });
  await seed(pc);
});
test.afterEach(async ({ pc }) => clean(pc));

const view = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('toolbar', { name: 'Vista' }).getByRole('button', { name });

test('the view switch picks Settimana and Agenda and the choice survives a reload', async ({ page }) => {
  await page.goto('/desk/calendar');
  await expect(view(page, 'Mese')).toHaveAttribute('aria-pressed', 'true');
  await view(page, 'Settimana').click();
  await expect(page.getByRole('region', { name: '9 - 15 novembre' })).toBeVisible();
  await page.reload();
  await expect(view(page, 'Settimana')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: '9 - 15 novembre' })).toBeVisible();
  await view(page, 'Agenda').click();
  await expect(page.getByRole('region', { name: 'Prossimi giorni' })).toBeVisible();
  await page.reload();
  await expect(view(page, 'Agenda')).toHaveAttribute('aria-pressed', 'true');
  await view(page, 'Mese').click();
  await expect(page.getByRole('region', { name: 'novembre 2026' })).toBeVisible();
});

test('a shift added through the card shows in the week, the agenda and the day panel, never as a month chip', async ({
  page,
}) => {
  await page.goto('/desk/calendar');
  await page.getByRole('button', { name: 'Nuovo evento' }).click();
  const card = page.getByRole('dialog', { name: 'Nuovo evento' });
  await card.getByRole('switch', { name: 'Turno' }).click();
  await expect(card.getByRole('textbox', { name: 'Titolo' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Salva' })).toBeDisabled();
  await card.getByRole('textbox', { name: 'Persona' }).fill('Persona A');
  await card.getByLabel('Dalle').fill('22:00');
  await card.getByLabel('Alle', { exact: true }).fill('06:00');
  // An overnight span is not an order error for a shift.
  await expect(card.getByText("L'ora di fine deve essere dopo quella di inizio")).toHaveCount(0);
  await card.getByRole('button', { name: 'Salva' }).click();
  await expect(card).toHaveCount(0);

  // Month: in the chosen day's panel, not in the cell.
  const month = page.getByRole('region', { name: 'novembre 2026' });
  const panel = page.getByRole('complementary', { name: 'domenica 15 novembre' });
  await expect(panel.getByText('Turno 22-6')).toBeVisible();
  await expect(panel.getByText('Persona A')).toBeVisible();
  const cell = month.locator('[data-day="2026-11-15"]');
  await expect(cell.getByText('16:30 Dentista')).toBeVisible();
  await expect(cell.getByText('Persona A')).toHaveCount(0);
  await expect(cell.getByText(/22:00/)).toHaveCount(0);

  await view(page, 'Settimana').click();
  const column = page.getByRole('region', { name: 'domenica 15 novembre' });
  await expect(column.getByText('Turno 22-6')).toBeVisible();
  await expect(column.getByText('Persona A')).toBeVisible();

  await view(page, 'Agenda').click();
  const today = page.getByRole('listitem').filter({ hasText: 'Oggi' }).first();
  await expect(today.getByText('22:00 - 6:00')).toBeVisible();
  await expect(today.getByText('Persona A')).toBeVisible();

  // The shift opens its own card for editing.
  await today.getByRole('button', { name: /Persona A/ }).click();
  const edit = page.getByRole('dialog', { name: 'Turno' });
  await expect(edit.getByRole('switch', { name: 'Turno' })).toBeChecked();
  await expect(edit.getByRole('textbox', { name: 'Persona' })).toHaveValue('Persona A');
});

test('Mostra hides the shifts in the agenda and shows them again, and remembers', async ({ page, pc }) => {
  await seedShifts(pc);
  await page.goto('/desk/calendar');
  await view(page, 'Agenda').click();
  const list = page.getByRole('region', { name: 'Prossimi giorni' });
  await expect(list.getByText('Persona B')).toBeVisible();
  const mostra = page.getByRole('region', { name: 'Mostra' });
  await mostra.getByRole('switch', { name: 'Turni' }).click();
  await expect(list.getByText('Persona B')).toHaveCount(0);
  await expect(list.getByText('Dentista')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Mostra' }).getByRole('switch', { name: 'Turni' })).not.toBeChecked();
  await expect(list.getByText('Persona B')).toHaveCount(0);
  // The week reads the same toggles.
  await view(page, 'Settimana').click();
  await page.getByRole('button', { name: 'Settimana successiva' }).click();
  await expect(page.getByRole('region', { name: 'giovedì 19 novembre' }).getByText('Visita')).toBeVisible();
  await expect(page.getByText('Persona A')).toHaveCount(0);
  await view(page, 'Agenda').click();
  await page.getByRole('region', { name: 'Mostra' }).getByRole('switch', { name: 'Turni' }).click();
  await expect(list.getByText('Persona B')).toBeVisible();
});

test('the week moves by week, returns with Oggi and names what comes after', async ({ page, pc }) => {
  await seedShifts(pc);
  await pc.post('/trpc/calendar.add', { data: { title: 'Esame', day: '2026-11-24' }, headers: json });
  await page.goto('/desk/calendar');
  await view(page, 'Settimana').click();
  await expect(page.getByRole('region', { name: '9 - 15 novembre' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'domenica 15 novembre' }).getByText('16:30 · Evento')).toBeVisible();
  await page.getByRole('button', { name: 'Settimana successiva' }).click();
  const week = page.getByRole('region', { name: '16 - 22 novembre' });
  await expect(week).toBeVisible();
  await expect(week.getByRole('region', { name: 'martedì 17 novembre' }).getByText('Turno 22-6')).toBeVisible();
  await expect(week.getByRole('region', { name: 'martedì 17 novembre' }).getByText('Persona B')).toBeVisible();
  await expect(week.getByText('mar 24, Esame')).toBeVisible();
  await page.getByRole('button', { name: 'Settimana precedente' }).click();
  await page.getByRole('button', { name: 'Settimana precedente' }).click();
  await expect(page.getByRole('region', { name: '2 - 8 novembre' })).toBeVisible();
  await page.getByRole('button', { name: 'Oggi' }).click();
  await expect(page.getByRole('region', { name: '9 - 15 novembre' })).toBeVisible();
});

test('the agenda names Oggi and Domani and its small month jumps the list to a day', async ({ page, pc }) => {
  await seedShifts(pc);
  await page.goto('/desk/calendar');
  await view(page, 'Agenda').click();
  const list = page.getByRole('region', { name: 'Prossimi giorni' });
  await expect(list.getByText('Oggi', { exact: true })).toBeVisible();
  await expect(list.getByText('Domani', { exact: true })).toBeVisible();
  await expect(list.getByText('Riprendere step 55')).toBeVisible();
  const mini = page.getByRole('region', { name: 'Mese per scegliere il giorno' });
  await expect(mini.getByText('novembre 2026')).toBeVisible();
  await mini.getByRole('button', { name: 'giovedì 19 novembre' }).click();
  await expect(list.getByText('Visita')).toBeVisible();
  await expect(list.getByText('Riprendere step 55')).toHaveCount(0);
  await expect(list.getByText('Dentista')).toHaveCount(0);
  await mini.getByRole('button', { name: 'Mese dopo' }).click();
  await expect(mini.getByText('dicembre 2026')).toBeVisible();
});
