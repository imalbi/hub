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

test('capture on Panoramica has no current record', async ({ page }) => {
  await page.goto('/desk');
  await expect(page.getByRole('navigation', { name: 'Zone' })).toBeVisible();
  await page.keyboard.press('n');
  await expect(
    page.getByRole('dialog', { name: 'Nuovo post-it' }).getByText('Riguarda:', { exact: false }),
  ).toHaveCount(0);
});

test('Esc closes the card without saving and the widget button opens it', async ({ page, pc }) => {
  await showBoard(page, pc);
  await page.getByRole('region', { name: 'Post-it', exact: true }).getByRole('button', { name: 'Aggiungi' }).click();
  const card = page.getByRole('dialog', { name: 'Nuovo post-it' });
  await card.getByRole('textbox', { name: 'Testo del post-it' }).fill('Da scartare');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(page.getByText('Da scartare')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Nessun post-it. Premi N per scriverne uno.' })).toBeVisible();
});

test('removing the last due note animates it out in Oggi and Post-it', async ({ page, pc }) => {
  await showBoard(page, pc);
  const widget = page.getByRole('region', { name: 'Post-it', exact: true });
  await expect(widget).toBeVisible();
  await widget.getByRole('button', { name: 'Aggiungi' }).click();
  const card = page.getByRole('dialog', { name: 'Nuovo post-it' });
  await card.getByRole('textbox', { name: 'Testo del post-it' }).fill('Da togliere');
  await page.evaluate(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (!(mutation.target instanceof HTMLElement)) continue;
        const row = mutation.target.closest('li');
        const opacity = mutation.oldValue?.match(/(?:^|;)\s*opacity:\s*([\d.]+)/)?.[1];
        if (row?.textContent?.includes('Da togliere') && opacity !== undefined && Number(opacity) < 1) {
          document.documentElement.dataset.noteEntryAnimated = 'true';
        }
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style'],
      attributeOldValue: true,
      subtree: true,
    });
  });
  await page.keyboard.press('Enter');

  const oggi = page.getByRole('region', { name: 'Oggi', exact: true });
  const todayRow = oggi.locator('li').filter({ hasText: 'Da togliere' });
  const widgetRow = widget.locator('li').filter({ hasText: 'Da togliere' });
  await oggi.evaluate((element) => (element.dataset.notesTodayTest = ''));
  await widget.evaluate((element) => (element.dataset.notesWidgetTest = ''));
  await expect(todayRow).toBeVisible();
  await expect(widgetRow).toBeVisible();
  await expect.poll(() => page.locator('html').getAttribute('data-note-entry-animated')).toBe('true');

  await page.evaluate(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (!(mutation.target instanceof HTMLElement) || mutation.target.getAttribute('aria-hidden') !== 'true')
          continue;
        const row = mutation.target.closest('li');
        if (!row?.textContent?.includes('Da togliere')) continue;
        const location = row.closest('[data-notes-today-test]')
          ? 'today'
          : row.closest('[data-notes-widget-test]')
            ? 'widget'
            : null;
        if (location)
          document.documentElement.dataset[`${location}RowExit`] = row.hasAttribute('inert') ? 'inert' : 'focusable';
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-hidden'],
      subtree: true,
    });
  });
  await widgetRow.getByRole('button', { name: 'Stacca post-it: Da togliere' }).click();

  const html = page.locator('html');
  await expect.poll(() => html.getAttribute('data-today-row-exit')).toBe('inert');
  await expect.poll(() => html.getAttribute('data-widget-row-exit')).toBe('inert');
  await expect(todayRow).toHaveCount(0);
  await expect(widgetRow).toHaveCount(0);
});

test('reduced motion shows and removes a post-it at rest', async ({ page, pc }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await showBoard(page, pc);
  const widget = page.getByRole('region', { name: 'Post-it', exact: true });
  await widget.getByRole('button', { name: 'Aggiungi' }).click();
  const card = page.getByRole('dialog', { name: 'Nuovo post-it' });
  await card.getByRole('textbox', { name: 'Testo del post-it' }).fill('Senza movimento');
  await page.keyboard.press('Enter');
  const row = widget.locator('li').filter({ hasText: 'Senza movimento' });
  await expect(row).toBeVisible();
  await expect(row).toHaveCSS('opacity', '1');
  const box = await row.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);
  await row.getByRole('button', { name: 'Stacca post-it: Senza movimento' }).click();
  await expect(row).toHaveCount(0);
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
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await showBoard(page, pc);
  const oggi = page.getByRole('region', { name: 'Oggi', exact: true });
  const widget = page.getByRole('region', { name: 'Post-it', exact: true });
  await expect(widget.getByRole('heading', { name: 'In arrivo' })).toBeVisible();
  await expect(widget.getByText('da agente Locale')).toBeVisible();
  await expect(oggi.getByText('Oggi facciamo lo step 40')).toHaveCount(0);
  await page.clock.fastForward('24:00:00');
  await expect(oggi.getByText('Oggi facciamo lo step 40')).toBeVisible();
  await expect(oggi.getByText('da agente Locale')).toBeVisible();
  await expect(widget.getByRole('heading', { name: 'In arrivo' })).toBeHidden();
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
  await card.getByRole('button', { name: 'Scegli un giorno' }).click();
  // Yesterday is out of reach, the 19th is picked from the grid.
  await expect(card.getByRole('button', { name: 'venerdì 13 novembre' })).toBeDisabled();
  await card.getByRole('button', { name: 'giovedì 19 novembre' }).click();
  await expect(card.getByRole('group', { name: 'novembre 2026' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'gio 19' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('textbox', { name: 'Testo del post-it' }).fill('Portare i documenti');
  await page.keyboard.press('Enter');
  await expect(later.getByText('giovedì 19')).toBeVisible();
});

test('a day can be written in Italian in the card, and an unknown one is refused', async ({ page, pc }) => {
  await showBoard(page, pc);
  await expect(page.getByRole('region', { name: 'Post-it', exact: true })).toBeVisible();
  await page.keyboard.press('n');
  const card = page.getByRole('dialog', { name: 'Nuovo post-it' });
  await card.getByRole('button', { name: 'Scegli un giorno' }).click();
  const day = card.getByRole('textbox', { name: 'Oppure scrivi un giorno' });
  await day.fill('boh');
  await day.press('Enter');
  await expect(card.getByText('Non capisco il giorno')).toBeVisible();
  await expect(day).toHaveAttribute('aria-invalid', 'true');
  await day.fill('venerdì');
  await day.press('Enter');
  await expect(card.getByRole('button', { name: 'ven 20' })).toHaveAttribute('aria-pressed', 'true');
});
