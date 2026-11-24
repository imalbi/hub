import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { chooseTheme } from './themes.ts';

// "Now" is Saturday 14 November 2026, 17:48 local, so the card opens on Oggi and every label is fixed.
const exampleSuffix = process.env.HUB_EXAMPLE_MODULES === '1' ? '-example' : '';
const NOW = new Date(2026, 10, 14, 17, 48);
const at = (day: number, hour: number) => new Date(2026, 10, day, hour).getTime();
const notes = [
  {
    id: 'a',
    text: 'Oggi facciamo lo step 40, partendo dal board di Studio',
    forDay: '2026-11-14',
    source: 'desk',
    createdAt: at(13, 22),
  },
  {
    id: 'b',
    text: 'Ripartire dai test del widget, manca il fake clock',
    forDay: '2026-11-14',
    source: 'agent:Claude Code',
    createdAt: at(13, 21),
  },
  { id: 'c', text: 'Chiamare per il tagliando', forDay: '2026-11-14', source: 'desk', createdAt: at(14, 9) },
  { id: 'd', text: 'Comprare il caffe', forDay: '2026-11-14', source: 'desk', createdAt: at(14, 8) },
  { id: 'e', text: 'Rivedere la review della 38', forDay: '2026-11-15', source: 'desk', createdAt: at(14, 10) },
  { id: 'f', text: 'Portare i documenti', forDay: '2026-11-19', source: 'desk', createdAt: at(14, 10) },
];
const board = [
  { widget: 'today', size: 'full', x: 0, y: 0 },
  { widget: 'notes', size: 'full', x: 0, y: 2 },
];
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

// The post-its come from a live subscription; swap its data for fixed ones, everything else reaches the fake server.
async function freezeNotes(page: Page) {
  await page.routeWebSocket(/\/trpc/, (socket) => {
    const server = socket.connectToServer();
    const ids = new Set<unknown>();
    socket.onMessage((message) => {
      try {
        const value: unknown = JSON.parse(message.toString());
        // The client batches the requests of one tick into an array.
        for (const request of Array.isArray(value) ? value : [value])
          if (isObject(request) && isObject(request.params) && request.params.path === 'notes.onOpen')
            ids.add(request.id);
      } catch {
        // Not JSON: forwarded as it is.
      }
      server.send(message);
    });
    server.onMessage((message) => {
      try {
        const value: unknown = JSON.parse(message.toString());
        if (isObject(value) && ids.has(value.id) && isObject(value.result) && value.result.type === 'data') {
          socket.send(JSON.stringify({ ...value, result: { ...value.result, data: notes } }));
          return;
        }
      } catch {
        // Not JSON: forwarded as it is.
      }
      socket.send(message);
    });
  });
}

test.beforeEach(async ({ page, pc }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(NOW);
  await freezeNotes(page);
  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: board },
    headers: { 'content-type': 'application/json' },
  });
  await page.goto('/desk');
  await expect(page.getByRole('region', { name: 'Post-it', exact: true }).getByText('Comprare il caffe')).toBeVisible();
  // Esteso shows two cards a day (step 66): the first is the readiness check.
  await expect(
    page.getByRole('region', { name: 'Post-it per oggi' }).getByText(/Oggi facciamo lo step 40/),
  ).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
});

test.afterEach(async ({ pc }) => {
  await pc.post('/trpc/layout.reset', { data: { zone: 'overview' }, headers: { 'content-type': 'application/json' } });
});

const sizes = [
  { name: '', width: 1920, height: 1080 },
  { name: '-4k', width: 3840, height: 2160 },
];
for (const size of sizes) {
  test(`Oggi with post-its at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.mouse.move(0, 0);
    await expect(page.getByRole('region', { name: 'Oggi', exact: true })).toHaveScreenshot(
      `notes-oggi${size.name}${exampleSuffix}.png`,
      { animations: 'disabled' },
    );
  });
  test(`the Post-it widget at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.mouse.move(0, 0);
    await expect(page.getByRole('region', { name: 'Post-it', exact: true })).toHaveScreenshot(
      `notes-widget${size.name}.png`,
      { animations: 'disabled' },
    );
  });
  test(`the capture card at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.keyboard.press('n');
    const card = page.getByRole('dialog', { name: 'Nuovo post-it' });
    await card.getByRole('textbox', { name: 'Testo del post-it' }).fill('Domani ripartire dalla review della 38');
    await expect(card.getByRole('button', { name: 'Oggi' })).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(0, 0);
    await expect(card.locator('[data-modal-panel]')).toHaveScreenshot(`notes-capture${size.name}${exampleSuffix}.png`, {
      animations: 'disabled',
    });
  });
}

test('the capture card with the calendar open', async ({ page }) => {
  await page.keyboard.press('n');
  const card = page.getByRole('dialog', { name: 'Nuovo post-it' });
  await card.getByRole('textbox', { name: 'Testo del post-it' }).fill('Portare i documenti');
  await card.getByRole('button', { name: 'Scegli un giorno' }).click();
  await card.getByRole('button', { name: 'giovedì 19 novembre' }).click();
  await card.getByRole('button', { name: 'gio 19' }).click();
  await expect(card.getByRole('group', { name: 'novembre 2026' })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(card.locator('[data-modal-panel]')).toHaveScreenshot('notes-capture-calendar.png', {
    animations: 'disabled',
  });
});

test('Oggi, the widget and the capture card in paper', async ({ page }) => {
  await page.goto('/desk/settings/appearance');
  await chooseTheme(page, 'Chiaro');
  await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Panoramica' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await expect(page.getByRole('region', { name: 'Post-it', exact: true }).getByText('Comprare il caffe')).toBeVisible();
  // Esteso shows two cards a day (step 66): the first is the readiness check.
  await expect(
    page.getByRole('region', { name: 'Post-it per oggi' }).getByText(/Oggi facciamo lo step 40/),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page.getByRole('region', { name: 'Oggi', exact: true })).toHaveScreenshot(
    `notes-oggi-paper${exampleSuffix}.png`,
    {
      animations: 'disabled',
    },
  );
  await expect(page.getByRole('region', { name: 'Post-it', exact: true })).toHaveScreenshot('notes-widget-paper.png', {
    animations: 'disabled',
  });
  await page.keyboard.press('n');
  const card = page.getByRole('dialog', { name: 'Nuovo post-it' });
  await card.getByRole('textbox', { name: 'Testo del post-it' }).fill('Domani ripartire dalla review della 38');
  await page.mouse.move(0, 0);
  await expect(card.locator('[data-modal-panel]')).toHaveScreenshot('notes-capture-paper.png', {
    animations: 'disabled',
  });
});
