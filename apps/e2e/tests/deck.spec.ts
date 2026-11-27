import { breakHello } from './broken-module.ts';
import type { Page, WebSocket as PageSocket } from '@playwright/test';
import { playPause, restoreDesktop } from './desktop.ts';
import { expect, test } from './fixtures.ts';
import { controlSockets } from './sockets.ts';
import { SERVER_PORT, SERVER_URL } from './hosts.ts';

const audioTile = (page: Page) => page.getByRole('button', { name: /^Audio:/ });
const player = (page: Page) => page.getByRole('region', { name: 'In riproduzione' });
const examples = process.env.HUB_EXAMPLE_MODULES === '1';

test('the deck banner confirms an agent request', async ({ page, pc }) => {
  await expect
    .poll(async () => {
      const response = await pc.post(`http://localhost:${SERVER_PORT}/mcp`, {
        headers: { accept: 'application/json, text/event-stream' },
        data: {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'system.suspend', arguments: { confirmed: true } },
        },
      });
      return JSON.stringify(await response.json());
    })
    .toContain('awaiting confirmation');
  const banner = page.getByRole('complementary', { name: 'Richiesta di conferma' });
  await expect(banner).toBeVisible();
  await page.screenshot({ path: '/tmp/hub-step32-deck.png', fullPage: true });
  await expect(banner).toHaveScreenshot(
    examples ? 'agent-confirmation-banner-example.png' : 'agent-confirmation-banner.png',
  );
  const button = banner.getByRole('button', { name: 'Tieni premuto per confermare' });
  await button.hover();
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(banner).toHaveCount(0);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/deck');
});

test.afterEach(async ({ pc }) => {
  await restoreDesktop(pc);
});

test('the deck has two pages and no duplicate music tiles', async ({ page }) => {
  await expect(page.getByRole('navigation', { name: 'Pagine' }).getByRole('button')).toHaveCount(2);
  const desk = page.getByRole('region', { name: 'Scrivania', exact: true });
  await expect(desk.getByRole('button', { name: /^Media:/ })).toHaveCount(0);
  await expect(desk.getByRole('button', { name: /^Brano successivo:/ })).toHaveCount(0);
});

test('an obsolete saved page opens Scrivania', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('hub.deck.page', 'study'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Vai a Scrivania' })).toHaveAttribute('aria-current', 'page');
  await page.evaluate(() => localStorage.removeItem('hub.deck.page'));
});

test('the deck has no duplicate music tile', async ({ page }) => {
  await expect(audioTile(page)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Scrivania' }).getByRole('button', { name: /^Media:/ })).toHaveCount(0);
});

test('audio and player show the state of the fake desktop', async ({ page }) => {
  await expect(audioTile(page)).toHaveAccessibleName('Audio: Cuffie · 80%');
  await expect(player(page).getByText('Title', { exact: true })).toBeVisible();
  await expect(player(page).getByRole('button', { name: 'Metti in pausa la musica' })).toBeVisible();
});

test('deck keeps short loading text while live tile state is delayed', async ({ page }) => {
  await page.routeWebSocket(/\/trpc/, (socket) => {
    const server = socket.connectToServer();
    const ids = new Set<unknown>();
    socket.onMessage((message) => {
      const value: unknown = JSON.parse(message.toString());
      const items: unknown[] = Array.isArray(value) ? value : [value];
      for (const item of items) {
        if (typeof item !== 'object' || item === null || !('params' in item) || !('id' in item)) continue;
        const params: unknown = item.params;
        if (
          typeof params === 'object' &&
          params !== null &&
          'path' in params &&
          typeof params.path === 'string' &&
          params.path.endsWith('.onState')
        )
          ids.add(item.id);
      }
      server.send(message);
    });
    server.onMessage((message) => {
      const value: unknown = JSON.parse(message.toString());
      if (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        ids.has(value.id) &&
        'result' in value &&
        typeof value.result === 'object' &&
        value.result !== null &&
        'type' in value.result &&
        value.result.type === 'data'
      )
        return;
      socket.send(message);
    });
  });
  await page.reload();
  await expect(audioTile(page)).toHaveAccessibleName('Audio: Caricamento');
  await expect(audioTile(page)).toBeDisabled();
});

test('the audio dialog selects outputs and returns focus to its tile', async ({ page }) => {
  await audioTile(page).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('Cuffie');
  const outputs = dialog.getByRole('toolbar', { name: 'Uscite configurate' });
  await outputs.getByRole('button', { name: 'Casse', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('Casse');
  await expect(audioTile(page)).toHaveAccessibleName('Audio: Casse · 80%');
  await outputs.getByRole('button', { name: 'Cuffie', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('Cuffie');
  await dialog.getByRole('button', { name: 'Chiudi', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(audioTile(page)).toBeFocused();
  await audioTile(page).click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(audioTile(page)).toBeFocused();
});

test('a change made elsewhere reaches the open player without a reload', async ({ page, pc }) => {
  await expect(player(page).getByRole('button', { name: 'Metti in pausa la musica' })).toBeVisible();
  expect((await playPause(pc)).ok()).toBe(true);
  await expect(player(page).getByRole('button', { name: 'Riproduci musica' })).toBeVisible();
  expect((await playPause(pc)).ok()).toBe(true);
  await expect(player(page).getByRole('button', { name: 'Metti in pausa la musica' })).toBeVisible();
});

test('the connection-lost state shows when the socket drops and clears when it is back', async ({ page }) => {
  const sockets = await controlSockets(page);
  // Only a dev server has a hot-reload socket (the e2e runner serves a build); when there is one it must stay open.
  const otherSockets: PageSocket[] = [];
  page.on('websocket', (socket) => {
    if (new URL(socket.url()).pathname !== '/trpc') otherSockets.push(socket);
  });
  await page.goto('/deck');
  await expect(audioTile(page)).toHaveAccessibleName('Audio: Cuffie · 80%');
  await expect(page.getByText('Connessione persa')).toBeHidden();

  await audioTile(page).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('slider', { name: 'Volume', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('toolbar', { name: 'Uscite configurate' }).getByRole('button')).toHaveCount(2);
  await sockets.cut();
  // The retry backs off, so the page may need a few seconds: the default 5 s expect timeout is too tight.
  await expect(page.getByText('Connessione persa')).toBeVisible({ timeout: 15_000 });
  expect(otherSockets.every((socket) => !socket.isClosed())).toBe(true);
  await expect(dialog.getByRole('slider', { name: 'Volume', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Silenzia uscita audio', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('toolbar', { name: 'Uscite configurate' }).locator('button:enabled')).toHaveCount(0);
  for (const button of await dialog.getByRole('toolbar', { name: 'Uscite configurate' }).getByRole('button').all())
    await expect(button).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(audioTile(page)).toHaveAccessibleName('Audio: Non disponibile');
  await expect(audioTile(page)).toBeDisabled();

  await sockets.restore();
  await expect(page.getByText('Connessione persa')).toBeHidden({ timeout: 15_000 });
});

test('the deck applies the theme chosen on this device, a custom one included', async ({ page, pc }) => {
  const colors = {
    background: '#101418',
    foreground: '#e0e3e8',
    surface: '#1c2024',
    surfaceRaised: '#262a2f',
    muted: '#31353a',
    mutedForeground: '#c0c7cd',
    border: '#e0e3e81a',
    primary: '#e0e3e8',
    primaryForeground: '#101418',
    accent: '#8ecff2',
    success: '#7dd69a',
    danger: '#ffb4ab',
  };
  const saved = await pc.post('/trpc/theme.save', {
    data: { name: 'Deck', base: 'ink', values: { mode: 'dark', colors } },
    headers: { 'content-type': 'application/json' },
  });
  const { id } = (await saved.json()).result.data;
  try {
    await page.evaluate((value) => localStorage.setItem('hub.theme', value), `custom-${id}`);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', `custom-${id}`);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 20, 24)');
  } finally {
    await page.evaluate(() => localStorage.removeItem('hub.theme'));
    await pc.post('/trpc/theme.delete', {
      data: { id, confirmed: true },
      headers: { 'content-type': 'application/json' },
    });
  }
});

test('the dots and a swipe move between pages, and the page shown survives a reload', async ({ page }) => {
  const pages = page.getByRole('navigation', { name: 'Pagine' });
  const dot = (name: string) => pages.getByRole('button', { name: `Vai a ${name}`, exact: true });
  try {
    await expect(dot('Scrivania')).toHaveAttribute('aria-current', 'page');
    await page.locator('.deck-pages').evaluate((strip) => strip.scrollTo({ left: strip.clientWidth }));
    await expect(dot('Sistema')).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(dot('Sistema')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('combobox', { name: 'Aspetto' })).toBeInViewport();
  } finally {
    await page.evaluate(() => localStorage.removeItem('hub.deck.page'));
  }
});

test('two pages keep a gap between them while swiping', async ({ page }) => {
  const sections = page.locator('.deck-pages > section');
  const first = await sections.nth(0).boundingBox();
  const second = await sections.nth(1).boundingBox();
  expect(second!.x - (first!.x + first!.width)).toBe(32); // --spacing-xl
});

test('the Sistema page chooses the theme of this device', async ({ page }) => {
  await page.getByRole('button', { name: 'Vai a Sistema' }).click();
  try {
    await page.getByRole('combobox', { name: 'Aspetto' }).selectOption({ label: 'Chiaro' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
    // A new built-in theme is the same CSS on the deck: the page really takes its ground color.
    await page.getByRole('combobox', { name: 'Aspetto' }).selectOption({ label: 'Notte' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(5, 7, 14)');
  } finally {
    await page.evaluate(() => {
      localStorage.removeItem('hub.theme');
      localStorage.removeItem('hub.deck.page');
    });
  }
});

test('the player bar shows the track on every page and plays or pauses it', async ({ page }) => {
  const player = page.getByRole('region', { name: 'In riproduzione' });
  for (const name of ['Scrivania', 'Sistema']) {
    await page.getByRole('button', { name: `Vai a ${name}` }).click();
    await expect(player.getByText('Title', { exact: true })).toBeVisible();
    await player.getByRole('button', { name: 'Metti in pausa la musica' }).click();
    await expect(player.getByRole('button', { name: 'Riproduci musica' })).toBeVisible();
    await player.getByRole('button', { name: 'Riproduci musica' }).click();
    await player.getByRole('button', { name: 'Brano successivo' }).click();
    await expect(player.getByText('Second Title', { exact: true })).toBeVisible();
    await player.getByRole('button', { name: 'Brano precedente' }).click();
  }
  await page.evaluate(() => localStorage.removeItem('hub.deck.page'));
});

test('the player bar is hidden when no player is running', async ({ page }) => {
  // Media state null is "no player"; the fake desktop always has one, so replace its pushes on this page.
  await page.routeWebSocket(/\/trpc/, (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      const text = message.toString();
      socket.send(text.includes('"artKey"') ? text.replace(/"data":\{[^}]*"artKey"[^}]*\}/, '"data":null') : text);
    });
  });
  await page.goto('/deck');
  await expect(audioTile(page)).toBeVisible();
  await expect(page.getByRole('region', { name: 'In riproduzione' })).toHaveCount(0);
});

test('the Sistema page powers off only after a hold', async ({ page }) => {
  await page.getByRole('button', { name: 'Vai a Sistema' }).click();
  try {
    const system = page.getByRole('region', { name: 'Sistema' });
    await expect(system.getByText('212 W')).toBeVisible();
    for (const name of [/^Blocca:/, /^Chat:/, /^Lettore:/])
      await expect(system.getByRole('button', { name })).toHaveCount(0);
    const powerOff = system.getByRole('button', { name: 'Tieni premuto per spegnere il PC' });
    await page.clock.install();
    await powerOff.hover();
    await page.mouse.down();
    await page.clock.runFor(400);
    await page.mouse.up();
    await expect(powerOff).toContainText('Tieni premuto');
    await page.mouse.down();
    await page.clock.runFor(900);
    await page.mouse.up();
    await expect(powerOff).toContainText('Inviato');
  } finally {
    await page.evaluate(() => localStorage.removeItem('hub.deck.page'));
  }
});

test('the monitor tile opens controls without toggling and supports both orientations', async ({ page, pc }) => {
  await page.getByRole('button', { name: 'Vai a Sistema' }).click();
  const [{ output }] = (await (await pc.get('/trpc/system.monitors')).json()).result.data;
  const calls = async () => (await (await pc.get(`${SERVER_URL}/__fake/system`)).json()).calls;
  const before = (await calls()).length;
  try {
    const tile = page.getByRole('region', { name: 'Sistema' }).getByRole('button', { name: /^Monitor verticale:/ });
    await expect(tile).toHaveAccessibleName('Monitor verticale: Spento');
    await expect(tile.locator('svg')).toHaveAttribute('data-weight', 'regular');
    await tile.click();
    const dialog = page.getByRole('dialog', { name: 'Monitor verticale', exact: true });
    await expect(dialog).toBeVisible();
    await expect(tile).toHaveAccessibleName('Monitor verticale: Spento');
    expect((await calls()).slice(before)).toEqual([]);
    const horizontal = dialog.getByRole('button', { name: 'Orizzontale Monitor verticale', exact: true });
    const vertical = dialog.getByRole('button', { name: 'Verticale Monitor verticale', exact: true });
    await horizontal.click();
    await expect(tile).toHaveAccessibleName('Monitor verticale: Acceso (orizzontale)');
    await expect(tile.locator('svg')).toHaveAttribute('data-weight', 'fill');
    await expect(horizontal).toBeDisabled();
    await vertical.click();
    await expect(tile).toHaveAccessibleName('Monitor verticale: Acceso (verticale)');
    await expect(vertical).toBeDisabled();
    await dialog.getByRole('button', { name: 'Spegni Monitor verticale', exact: true }).click();
    await expect(tile).toHaveAccessibleName('Monitor verticale: Spento');
    await dialog.getByRole('button', { name: 'Accendi Monitor verticale', exact: true }).click();
    await expect(tile).toHaveAccessibleName('Monitor verticale: Acceso (verticale)');
    expect((await calls()).slice(before)).toEqual([
      [`fake-horizontal-${output}`],
      [`fake-vertical-${output}`],
      [`fake-monitor-${output}`],
      [`fake-monitor-${output}`],
    ]);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(tile).toBeFocused();
  } finally {
    await pc.post(`${SERVER_URL}/__fake/monitor`, { data: { output, disabled: true, transform: 1 } });
    await page.evaluate(() => localStorage.removeItem('hub.deck.page'));
  }
});

test('Scrivania presents the requested controls in order', async ({ page }) => {
  const desk = page.getByRole('region', { name: 'Scrivania', exact: true });
  await expect(audioTile(page)).toBeVisible();
  const names = [/^Hub:/, /^Chat:/, /^Lettore:/, /^Audio:/, /^Microfono:/, /^Pomodoro:/, /^Blocca:/];
  const tiles = desk.locator(':scope > div > button, :scope > div > [role="group"]');
  await expect(tiles).toHaveCount(names.length);
  await expect(desk.getByRole('button', { name: /^AirPlay:/ })).toHaveCount(0);
  for (const [index, name] of names.entries()) await expect(tiles.nth(index)).toHaveAccessibleName(name);
  await expect(desk.getByRole('button', { name: /^(Abbassa volume|Alza volume|Volume −|Volume \+)/ })).toHaveCount(0);
  await expect(desk.getByText(/^(Volume −|Volume \+)$/)).toHaveCount(0);
});

test('the running Pomodoro header opens Scrivania', async ({ page, pc }) => {
  try {
    await page.getByRole('button', { name: 'Vai a Sistema' }).click();
    await expect(page.getByText('Server attivo')).toHaveCount(0);
    expect((await pc.post('/trpc/pomodoro.start', { data: {} })).ok()).toBe(true);
    await page.getByRole('button', { name: /Pomodoro in corso/ }).click();
    await expect(page.getByRole('region', { name: 'Scrivania', exact: true })).toBeVisible();
  } finally {
    await pc.post('/trpc/pomodoro.stop', { data: {} });
    await page.evaluate(() => localStorage.removeItem('hub.deck.page'));
  }
});

test('both pages and the player fit on the phone screen', async ({ page }) => {
  await expect(player(page).getByText('Title', { exact: true })).toBeVisible();
  for (const name of ['Scrivania', 'Sistema']) {
    await page.getByRole('button', { name: `Vai a ${name}` }).click();
    const region = page.getByRole('region', { name, exact: true });
    await expect(region).toBeInViewport({ ratio: 1 });
    const tiles = region.locator(':scope > div > button, :scope > div > [role=group]');
    for (const tile of await tiles.all()) {
      await expect(tile).toBeInViewport({ ratio: 1 });
      expect((await tile.boundingBox())?.height).toBeGreaterThanOrEqual(104);
    }
    await expect(player(page)).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
});

test('two monitors precede the module tiles and the holds start a new row', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.routeWebSocket(/\/trpc/, (socket) => {
    const server = socket.connectToServer();
    const monitorIds = new Set<unknown>();
    socket.onMessage((message) => {
      for (const request of [JSON.parse(message.toString())].flat())
        if (request?.params?.path === 'system.onMonitors') monitorIds.add(request.id);
      server.send(message);
    });
    server.onMessage((message) => {
      const reply = JSON.parse(message.toString());
      if (monitorIds.has(reply?.id) && reply.result?.type === 'data' && Array.isArray(reply.result.data)) {
        const second = {
          output: 'DP-3',
          label: 'Monitor TV',
          state: 'on',
          orientation: null,
          supportsHorizontal: false,
          supportsVertical: false,
        };
        socket.send(JSON.stringify({ ...reply, result: { ...reply.result, data: [...reply.result.data, second] } }));
      } else socket.send(message);
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Vai a Sistema' }).click();
  const system = page.getByRole('region', { name: 'Sistema', exact: true });
  await expect(system.getByRole('button', { name: /^Monitor TV:/ })).toBeVisible();
  const first = await system.getByRole('button', { name: /^Monitor verticale:/ }).boundingBox();
  const second = await system.getByRole('button', { name: /^Monitor TV:/ }).boundingBox();
  const hold = await system.getByRole('button', { name: 'Tieni premuto per sospendere il PC' }).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(hold).not.toBeNull();
  if (!first || !second || !hold) throw new Error('Missing system tile geometry');
  expect(second.x).toBeGreaterThan(first.x);
  if (examples) {
    await expect(system.getByRole('button', { name: /^Luci:/ })).toHaveCount(0);
    const example = await system.getByRole('button', { name: /^Esempio:/ }).boundingBox();
    expect(example).not.toBeNull();
    if (!example) throw new Error('Missing example tile geometry');
    expect(example.y).toBeGreaterThan(second.y);
    expect(hold.y).toBeGreaterThan(example.y);
  }
  expect(hold.x).toBe(first.x);
  expect(hold.y).toBeGreaterThan(second.y);
  await expect(player(page)).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Vai a Sistema' })).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: '/tmp/hub-b1-built-system-two.png', animations: 'disabled' });
  await page.evaluate(() => localStorage.removeItem('hub.deck.page'));
});

test('audio volume commits once on release and mute reflects live state', async ({ page, pc }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('audio.setVolume')) writes.push(request.url());
  });
  try {
    await audioTile(page).click();
    const dialog = page.getByRole('dialog');
    const slider = dialog.getByRole('slider', { name: 'Volume', exact: true });
    await expect(slider).toHaveValue('80');
    const box = await slider.boundingBox();
    if (!box) throw new Error('Missing volume slider geometry');
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 8 });
    await expect(slider).not.toHaveValue('80');
    expect(writes).toHaveLength(0);
    expect((await (await pc.get('/trpc/audio.state')).json()).result.data.volume).toBe(0.8);
    const picked = Number(await slider.inputValue());
    await page.mouse.up();
    await expect.poll(() => writes.length).toBe(1);
    await expect
      .poll(async () => (await (await pc.get('/trpc/audio.state')).json()).result.data.volume)
      .toBe(picked / 100);
    await expect(audioTile(page)).toHaveAccessibleName(`Audio: Cuffie · ${picked}%`);
    await slider.press('End');
    await expect(audioTile(page)).toHaveAccessibleName('Audio: Cuffie · 100%');
    await slider.press('Home');
    await expect(audioTile(page)).toHaveAccessibleName('Audio: Cuffie · 0%');
    const mute = dialog.getByRole('button', { name: 'Silenzia uscita audio', exact: true });
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    await expect(audioTile(page)).toHaveAccessibleName('Audio: Disattivata');
    expect((await (await pc.get('/trpc/audio.state')).json()).result.data.muted).toBe(true);
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
    await expect(audioTile(page)).toHaveAccessibleName('Audio: Cuffie · 0%');
  } finally {
    const state = (await (await pc.get('/trpc/audio.state')).json()).result.data;
    if (state.muted) await pc.post('/trpc/audio.toggleMute', { data: {} });
    await pc.post('/trpc/audio.setVolume', { data: { value: 0.8 } });
  }
});

test('the separate microphone tile updates the fake desktop', async ({ page, pc }) => {
  try {
    const mic = page.getByRole('button', { name: /^Microfono:/ });
    await mic.click();
    await expect(mic).toHaveAccessibleName('Microfono: Disattivato');
    await mic.click();
    await expect(mic).toHaveAccessibleName('Microfono: Attivo');
  } finally {
    const state = (await (await pc.get('/trpc/audio.state')).json()).result.data;
    if (state.micMuted) await pc.post('/trpc/audio.toggleMicMute', { data: {} });
  }
});

test('the jobs badge shows only while a fake job runs', async ({ page, pc, request }, testInfo) => {
  const started = await request.post(`${SERVER_URL}/__fake/jobs`);
  const { jobId } = await started.json();
  try {
    await expect(page.getByLabel('Job in esecuzione: 1')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('deck-jobs.png') });
    await pc.post('/trpc/jobs.cancel', { data: { jobId, confirmed: true } });
    await expect(page.getByLabel('Job in esecuzione: 1')).toHaveCount(0);
  } finally {
    await pc.post('/trpc/jobs.cancel', { data: { jobId, confirmed: true } });
  }
});

test('the corner setting of the device reaches the deck tiles, and pills stay pills', async ({ page }) => {
  const tile = audioTile(page);
  await expect(tile).toBeVisible();
  const radius = () => tile.evaluate((element) => Number.parseFloat(getComputedStyle(element).borderTopLeftRadius));
  const standard = await radius();
  await page.evaluate(() => localStorage.setItem('hub.radius', 'sharp'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-radius', 'sharp');
  expect(await radius()).toBeLessThan(standard);
  await page.evaluate(() => localStorage.removeItem('hub.radius'));
});

if (process.env.HUB_EXAMPLE_MODULES === '1') {
  test('a broken deck tile preserves power controls and page navigation', async ({ page }) => {
    const restore = await breakHello(page);
    await page.goto('/deck');
    await page.getByRole('button', { name: 'Vai a Sistema' }).click();
    await expect(page.getByRole('alert')).toContainText('Contenuto non disponibile');
    await expect(page.getByRole('alert')).toHaveScreenshot('tile-unavailable.png');
    await expect(page.getByRole('button', { name: 'Tieni premuto per spegnere il PC' })).toBeVisible();
    await page.getByRole('button', { name: 'Vai a Scrivania' }).click();
    await expect(page.getByRole('button', { name: 'Vai a Sistema' })).toBeVisible();
    await page.getByRole('button', { name: 'Vai a Sistema' }).click();
    restore();
    await page.getByRole('button', { name: 'Riprova', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Esempio: Saluti:/ })).toBeVisible();
  });
}

test('a silent socket is detected and subscriptions recover without a reload', async ({ page, pc }) => {
  const sockets = await controlSockets(page);
  await page.goto('/deck');
  await expect(player(page).getByRole('button', { name: 'Metti in pausa la musica' })).toBeVisible();
  await sockets.silence();
  await expect(page.getByText('Connessione persa')).toBeVisible({ timeout: 20_000 });
  await sockets.restore();
  await expect(page.getByText('Connessione persa')).toBeHidden({ timeout: 15_000 });
  expect((await playPause(pc)).ok()).toBe(true);
  await expect(player(page).getByRole('button', { name: 'Riproduci musica' })).toBeVisible();
});

test('returning to a visible page replaces the transport and keeps subscriptions', async ({ page, pc }) => {
  await controlSockets(page);
  await page.goto('/deck');
  await expect(player(page).getByRole('button', { name: 'Metti in pausa la musica' })).toBeVisible();
  const count = await page.evaluate(() => window.hubSockets.open.length);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.hubSockets.open.length)).toBe(count);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.hubSockets.open.length)).toBeGreaterThan(count);
  await expect.poll(() => page.evaluate(() => window.hubSockets.open.at(-1)?.readyState)).toBe(1);
  expect((await playPause(pc)).ok()).toBe(true);
  await expect(player(page).getByRole('button', { name: 'Riproduci musica' })).toBeVisible();
});
