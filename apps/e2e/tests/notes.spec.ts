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
  await expect(
    page.getByRole('region', { name: 'Post-it', exact: true }).locator('[data-empty-variant="compact"]'),
  ).toBeVisible();
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

test('C1: Medio shows 3 nearest notes with day labels and Grande groups Oggi, Domani, and Più avanti', async ({
  page,
  pc,
}) => {
  await pc.post('/trpc/notes.add', {
    data: { text: 'Chiedere conferma sede', forDay: '2026-11-14' },
    headers: json,
  });
  await pc.post('/trpc/notes.add', {
    data: { text: 'Stampare esercizi chimica', forDay: '2026-11-14' },
    headers: json,
  });
  await pc.post('/trpc/notes.add', {
    data: { text: 'Portare il libretto', forDay: '2026-11-15' },
    headers: json,
  });
  await pc.post('/trpc/notes.add', {
    data: { text: 'Ripassare domande Hub', forDay: '2026-11-19' },
    headers: json,
  });

  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: [{ widget: 'notes', size: 'medium', x: 0, y: 0 }] },
    headers: json,
  });
  await page.goto('/desk');

  const widget = page.getByRole('region', { name: 'Post-it', exact: true });
  await expect(widget.locator('kbd')).toHaveText('N');
  const addButton = widget.getByRole('button', { name: 'Aggiungi', exact: true });
  await expect(addButton).toBeVisible();
  await addButton.click();
  await expect(page.getByRole('dialog', { name: 'Nuovo post-it' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Nuovo post-it' })).toHaveCount(0);

  const mediumCards = widget.getByRole('listitem');
  await expect(mediumCards).toHaveCount(3);
  await expect(mediumCards.nth(0)).toContainText('Oggi');
  await expect(mediumCards.nth(1)).toContainText('Oggi');
  await expect(mediumCards.nth(2)).toContainText('Domani');
  await expect(mediumCards.nth(2)).toContainText('Portare il libretto');
  await expect(widget.getByText('Chiedere conferma sede')).toBeVisible();
  await expect(widget.getByText('Stampare esercizi chimica')).toBeVisible();
  await expect(widget.getByText('Ripassare domande Hub')).toHaveCount(0);

  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: [{ widget: 'notes', size: 'large', x: 0, y: 0 }] },
    headers: json,
  });
  await page.reload();

  const todayRegion = widget.getByRole('region', { name: 'Oggi', exact: true });
  const tomorrowRegion = widget.getByRole('region', { name: 'Domani', exact: true });
  const laterRegion = widget.getByRole('region', { name: 'Più avanti', exact: true });
  await expect(todayRegion.getByRole('listitem')).toHaveCount(2);
  await expect(todayRegion.getByText('Chiedere conferma sede')).toBeVisible();
  await expect(todayRegion.getByText('Stampare esercizi chimica')).toBeVisible();
  await expect(todayRegion.locator('li').getByText('Oggi', { exact: true })).toHaveCount(0);
  await expect(tomorrowRegion.getByRole('listitem')).toHaveCount(1);
  await expect(tomorrowRegion.getByText('Portare il libretto')).toBeVisible();
  await expect(laterRegion.getByRole('listitem')).toHaveCount(1);
  await expect(laterRegion.getByText('gio 19', { exact: true })).toBeVisible();
  await expect(laterRegion.getByText('Ripassare domande Hub')).toBeVisible();

  await tomorrowRegion.getByRole('button', { name: 'Stacca post-it: Portare il libretto' }).click();
  await expect(tomorrowRegion.getByText('Portare il libretto')).toHaveCount(0);
  await page.getByRole('button', { name: /^Annulla/ }).click();
  await expect(tomorrowRegion.getByText('Portare il libretto')).toBeVisible();

  const open: Array<{ id: string }> = (await (await pc.get('/trpc/notes.open')).json()).result.data;
  for (const { id } of open) await pc.post('/trpc/notes.remove', { data: { id }, headers: json });

  for (const size of ['large', 'medium'] as const) {
    await pc.post('/trpc/layout.save', {
      data: { zone: 'overview', items: [{ widget: 'notes', size, x: 0, y: 0 }] },
      headers: json,
    });
    await page.reload();
    await expect(widget.locator('[data-empty-variant="compact"]')).toBeVisible();
    await expect(widget.getByRole('heading', { name: 'Nessun post-it. Premi N per scriverne uno.' })).toBeVisible();
    const fits = await widget.evaluate((el) => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth);
    expect(fits, `empty ${size}`).toBe(true);
  }
});

test('W1 & W3: every size fits at 4K and 1080p and Grande caps 8 notes to 6 with altri 2 post-it', async ({
  page,
  pc,
}) => {
  const seed = [
    { text: 'Chiedere la RAL a BEST Computing prima di candidarmi al ruolo backend', forDay: '2026-11-14' },
    { text: 'Stampare errata corrige e verificare gli esempi del foglio due', forDay: '2026-11-14' },
    { text: 'Controllare orario ricevimento per firmare il piano studi', forDay: '2026-11-14' },
    { text: 'Portare il libretto universitario in segreteria didattica', forDay: '2026-11-15' },
    { text: 'Preparare elenco domande tecniche per la prossima call', forDay: '2026-11-15' },
    { text: 'Ripassare gli appunti di chimica organica sul progetto', forDay: '2026-11-19' },
    { text: 'Prenotare laboratorio per misura di conduttività settimanale', forDay: '2026-11-20' },
    { text: 'Inviare documentazione aggiornata per rinnovo contratto locale', forDay: '2026-11-21' },
  ];
  for (const entry of seed) await pc.post('/trpc/notes.add', { data: entry, headers: json });

  const widget = page.getByRole('region', { name: 'Post-it', exact: true });
  for (const size of ['medium', 'large', 'wide', 'full'] as const) {
    await pc.post('/trpc/layout.save', {
      data: { zone: 'overview', items: [{ widget: 'notes', size, x: 0, y: 0 }] },
      headers: json,
    });
    for (const viewport of [
      { width: 3840, height: 2160 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/desk');
      await expect(widget.getByRole('listitem').first()).toBeVisible();
      if (size === 'medium') {
        await expect(widget.getByRole('listitem')).toHaveCount(3);
      }
      if (size === 'large') {
        await expect(widget.getByRole('listitem')).toHaveCount(6);
        await expect(widget.getByText('altri 2 post-it', { exact: true })).toBeVisible();
      }
      if (size === 'medium' || size === 'large') {
        const hasScroller = await widget.evaluate((el) =>
          [...el.querySelectorAll('*')].some((node) => {
            const overflow = getComputedStyle(node).overflowY;
            return overflow === 'auto' || overflow === 'scroll';
          }),
        );
        expect(hasScroller, `${size} has no inner scroller`).toBe(false);
      }
      const fits = await widget.evaluate(
        (el) => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth,
      );
      expect(fits, `${size} at ${viewport.width}x${viewport.height}`).toBe(true);
    }
  }

  const open: Array<{ id: string }> = (await (await pc.get('/trpc/notes.open')).json()).result.data;
  for (const { id } of open) await pc.post('/trpc/notes.remove', { data: { id }, headers: json });

  for (let index = 1; index <= 8; index++) {
    await pc.post('/trpc/notes.add', {
      data: {
        text: `Nota molto lunga numero ${index} per verificare chiusura colonne senza sforare la cella grande`,
        forDay: '2026-11-19',
      },
      headers: json,
    });
  }
  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: [{ widget: 'notes', size: 'large', x: 0, y: 0 }] },
    headers: json,
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/desk');
  await expect(widget.getByRole('listitem')).toHaveCount(3);
  await expect(widget.getByText('altri 5 post-it', { exact: true })).toBeVisible();
  const singleColFits = await widget.evaluate(
    (el) => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth,
  );
  expect(singleColFits, 'single-column 8 later notes at 1920x1080').toBe(true);
});
