import { answerQueries } from './desktop.ts';
import { expect, test } from './fixtures.ts';
import { SERVER_URL } from './hosts.ts';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

test('Siti keeps its section in place while state arrives', async ({ page, request }) => {
  await configure(request, true);
  try {
    await page.setViewportSize({ width: 3840, height: 2160 });
    let release = () => {};
    let arrived = () => {};
    const stateArrived = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    await page.routeWebSocket(/\/trpc/, (socket) => {
      const server = socket.connectToServer();
      const ids = new Set<unknown>();
      const waiting: (string | Buffer)[] = [];
      let released = false;
      release = () => {
        released = true;
        for (const item of waiting) socket.send(item);
      };
      socket.onMessage((message) => {
        const value: unknown = JSON.parse(message.toString());
        for (const item of Array.isArray(value) ? value : [value])
          if (isObject(item) && isObject(item.params) && item.params.path === 'sites.onState') ids.add(item.id);
        server.send(message);
      });
      server.onMessage((message) => {
        const value: unknown = JSON.parse(message.toString());
        if (
          !released &&
          isObject(value) &&
          ids.has(value.id) &&
          isObject(value.result) &&
          value.result.type === 'data'
        ) {
          waiting.push(message);
          arrived();
        } else socket.send(message);
      });
    });
    await page.goto('/desk/lavoro');
    await stateArrived;
    const skeleton = page.getByRole('status', { name: 'Caricamento' });
    await expect(skeleton).toBeVisible();
    const before = await skeleton.boundingBox();
    release();
    const heading = page.getByRole('heading', { name: 'Alcuni siti non sono raggiungibili' });
    await expect(heading).toBeVisible();
    const after = await heading.boundingBox();
    if (!before || !after) throw new Error('Siti must be laid out');
    expect(Math.abs(before.x - after.x)).toBeLessThanOrEqual(8);
    expect(Math.abs(before.y - after.y)).toBeLessThanOrEqual(8);
    expect(Math.abs(before.width - after.width)).toBeLessThanOrEqual(8);
  } finally {
    await configure(request, false);
  }
});

test('an empty site list shows its empty state', async ({ page, request }) => {
  await configure(request, true);
  try {
    await page.routeWebSocket(/\/trpc/, (socket) => {
      const server = socket.connectToServer();
      const ids = new Set<unknown>();
      socket.onMessage((message) => {
        const value: unknown = JSON.parse(message.toString());
        for (const item of Array.isArray(value) ? value : [value])
          if (isObject(item) && isObject(item.params) && item.params.path === 'sites.onState') ids.add(item.id);
        server.send(message);
      });
      server.onMessage((message) => {
        const value: unknown = JSON.parse(message.toString());
        if (isObject(value) && ids.has(value.id) && isObject(value.result) && value.result.type === 'data') {
          socket.send(JSON.stringify({ ...value, result: { ...value.result, data: [] } }));
        } else socket.send(message);
      });
    });
    await page.goto('/desk/lavoro');
    await expect(page.getByRole('heading', { name: 'Nessun sito configurato.' })).toBeVisible();
  } finally {
    await configure(request, false);
  }
});

async function configure(request: import('@playwright/test').APIRequestContext, enabled: boolean) {
  await request.post(`${SERVER_URL}/__fake/sites`, { data: { enabled } });
  await expect
    .poll(
      async () => {
        try {
          const response = await request.get('/trpc/sites.state');
          const data: unknown = await response.json();
          return JSON.stringify(data).includes('https://example.com/up');
        } catch {
          return null;
        }
      },
      { timeout: 15000 },
    )
    .toBe(enabled);
}

test('Siti shows daily history and the widget lists only unreachable sites', async ({ page, pc, request }) => {
  await configure(request, true);
  try {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await answerQueries(page, { health: { ok: true, uptime: 42 } });
    await page.goto('/desk/lavoro');
    await expect(page.getByRole('heading', { name: 'Alcuni siti non sono raggiungibili' })).toBeVisible();
    const history = page.getByRole('button', { name: 'Sito non raggiungibile' });
    await expect(history.locator('[data-bar]')).toHaveCount(90);
    await history.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('status').filter({ hasText: '5 minuti di interruzione' })).toBeVisible();
    await page.keyboard.press('Escape');
    await history.blur();
    await page.addStyleTag({ content: '[data-latency] { visibility: hidden; }' });
    await page.mouse.move(0, 0);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await expect(page).toHaveScreenshot('desk-siti-4k.png', { animations: 'disabled' });
    await page.goto('/desk');
    await page.getByRole('button', { name: 'Modifica', exact: true }).click();
    await page.getByRole('button', { name: 'Aggiungi Siti', exact: true }).click();
    const widget = page.locator('[data-widget="sites"]');
    await expect(widget.getByText('Sito non raggiungibile')).toBeVisible();
    await expect(widget.getByText('Sito pronto')).toHaveCount(0);
    await page.goto('/desk/settings/sites');
    await expect(page.getByRole('heading', { name: 'Siti', level: 2 })).toBeVisible();
    await page.getByRole('textbox', { name: 'Nome riga 1' }).fill('Sito cambiato');
    await page.getByRole('button', { name: 'Salva e riavvia' }).click();
    await expect(page.getByText('Impostazioni salvate, Hub è di nuovo attivo')).toBeVisible({ timeout: 30000 });
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Nome riga 1' })).toHaveValue('Sito cambiato');
  } finally {
    await pc.post('/trpc/layout.reset', {
      data: { zone: 'overview' },
      headers: { 'content-type': 'application/json' },
    });
    await configure(request, false);
  }
});
