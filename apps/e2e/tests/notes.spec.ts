import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { SERVER_PORT } from './hosts.ts';

// The board with the Post-it widget under Oggi; Panoramica offers it, the default board does not hold it.
const board = [
  { widget: 'today', size: 'wide', x: 0, y: 0 },
  { widget: 'notes', size: 'wide', x: 0, y: 1 },
];
const json = { 'content-type': 'application/json' };

async function showBoard(page: Page, pc: APIRequestContext) {
  await pc.post('/trpc/layout.save', { data: { zone: 'overview', items: board }, headers: json });
  await page.goto('/desk');
}

test.beforeEach(async ({ page }) => {
  // Before 18:00, so the card starts on Oggi.
  await page.clock.install({ time: new Date(2026, 10, 14, 10, 0) });
});

test.afterEach(async ({ pc }) => {
  const open: Array<{ id: string }> = (await (await pc.get('/trpc/notes.open')).json()).result.data;
  for (const { id } of open) await pc.post('/trpc/notes.remove', { data: { id }, headers: json });
  await pc.post('/trpc/layout.reset', { data: { zone: 'overview' }, headers: json });
});

test('N key opens the card on any page, Invio saves it, and typing n in a field does nothing', async ({ page, pc }) => {
  await page.goto('/desk/media');
  await expect(page.getByRole('navigation', { name: 'Zone' })).toBeVisible();
  await page.keyboard.press('n');
  const card = page.getByRole('dialog', { name: 'Nuovo post-it' });
  await expect(card).toBeVisible();
  const field = card.getByRole('textbox', { name: 'Testo del post-it' });
  await expect(field).toBeFocused();
  await page.keyboard.type('nnn dentista');
  await expect(field).toHaveValue('nnn dentista');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(card).toHaveCount(0);
  await showBoard(page, pc);
  await expect(page.getByRole('region', { name: 'Post-it', exact: true }).getByText('nnn dentista')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Oggi', exact: true }).getByText('nnn dentista')).toBeVisible();
});

test('Esc closes the card without saving and the widget button opens it', async ({ page, pc }) => {
  await showBoard(page, pc);
  await page.getByRole('region', { name: 'Post-it', exact: true }).getByRole('button', { name: 'Aggiungi' }).click();
  const card = page.getByRole('dialog', { name: 'Nuovo post-it' });
  await card.getByRole('textbox', { name: 'Testo del post-it' }).fill('Da scartare');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(page.getByText('Da scartare')).toHaveCount(0);
  await expect(page.getByText('Nessun post-it', { exact: false })).toBeVisible();
});

test('the palette adds a post-it, it edits in place and Stacca can be undone', async ({ page, pc }) => {
  await showBoard(page, pc);
  await expect(page.getByRole('region', { name: 'Post-it', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await palette.getByRole('combobox', { name: 'Cerca azioni' }).fill('Aggiungi post-it');
  await palette.getByRole('option', { name: /Aggiungi post-it/ }).click();
  await palette.getByLabel('text').fill('Dal palette');
  await page.keyboard.press('Enter');
  const widget = page.getByRole('region', { name: 'Post-it', exact: true });
  await expect(widget.getByText('Dal palette')).toBeVisible();
  // Escape leaves the form page first, a second one closes the palette.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
  await widget.getByRole('button', { name: 'Modifica post-it: Dal palette' }).click();
  await widget.getByRole('textbox', { name: 'Testo del post-it' }).fill('Dal palette, rivisto');
  await page.keyboard.press('Enter');
  await expect(widget.getByText('Dal palette, rivisto')).toBeVisible();
  await widget.getByRole('button', { name: 'Stacca post-it: Dal palette, rivisto' }).click();
  await expect(widget.getByText('Dal palette, rivisto')).toHaveCount(0);
  await page.getByRole('button', { name: /^Annulla/ }).click();
  await expect(widget.getByText('Dal palette, rivisto')).toBeVisible();
});

test('a note an agent leaves for tomorrow opens Oggi when the day changes, and stays after', async ({ page, pc }) => {
  const sent = await pc.post(`http://localhost:${SERVER_PORT}/mcp`, {
    headers: { accept: 'application/json, text/event-stream' },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'notes.add', arguments: { text: 'Oggi facciamo lo step 40', forDay: '2026-11-15' } },
    },
  });
  expect(await sent.text()).toContain('"id"');
  expect(sent.ok()).toBe(true);
  await showBoard(page, pc);
  const oggi = page.getByRole('region', { name: 'Oggi', exact: true });
  const widget = page.getByRole('region', { name: 'Post-it', exact: true });
  await expect(widget.getByRole('heading', { name: 'In arrivo' })).toBeVisible();
  await expect(widget.getByText('da agente Locale')).toBeVisible();
  await expect(oggi.getByText('Oggi facciamo lo step 40')).toHaveCount(0);
  await page.clock.fastForward('24:00:00');
  await expect(oggi.getByText('Oggi facciamo lo step 40')).toBeVisible();
  await expect(oggi.getByText('da agente Locale')).toBeVisible();
  await expect(widget.getByRole('heading', { name: 'In arrivo' })).toHaveCount(0);
  await page.clock.fastForward('24:00:00');
  await expect(oggi.getByText('Oggi facciamo lo step 40')).toBeVisible();
});

test('the card files a post-it under Domani or a picked day, in the widget under In arrivo', async ({ page, pc }) => {
  await showBoard(page, pc);
  const widget = page.getByRole('region', { name: 'Post-it', exact: true });
  const later = widget.getByRole('region', { name: 'In arrivo' });
  await expect(widget).toBeVisible();
  await page.keyboard.press('n');
  const card = page.getByRole('dialog', { name: 'Nuovo post-it' });
  await card.getByRole('button', { name: 'Domani' }).click();
  await card.getByRole('textbox', { name: 'Testo del post-it' }).fill('Per domani');
  await page.keyboard.press('Enter');
  await expect(card).toHaveCount(0);
  await expect(later.getByText('Per domani')).toBeVisible();
  await expect(later.getByText('domani', { exact: true })).toBeVisible();
  await page.keyboard.press('n');
  await expect(card.getByRole('button', { name: 'Scegli un giorno' })).toBeVisible();
  await card.getByRole('textbox', { name: 'Giorno' }).fill('2026-11-19');
  await expect(card.getByRole('button', { name: 'gio 19' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('textbox', { name: 'Testo del post-it' }).fill('Portare i documenti');
  await page.keyboard.press('Enter');
  await expect(later.getByText('giovedì 19')).toBeVisible();
});
