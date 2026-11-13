import type { Page, WebSocket as PageSocket } from '@playwright/test';
import { playPause, restoreDesktop } from './desktop.ts';
import { expect, test } from './fixtures.ts';
import { controlSockets } from './sockets.ts';
import { SERVER_PORT, SERVER_URL } from './hosts.ts';

const audioTile = (page: Page) => page.getByRole('button', { name: /^Uscita audio/ });
const mediaTile = (page: Page) => page.getByRole('button', { name: /^Musica/ });

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
  await expect(banner).toHaveScreenshot('agent-confirmation-banner.png');
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

test('both tiles show the state of the fake desktop', async ({ page }) => {
  await expect(audioTile(page)).toHaveAccessibleName('Uscita audio: Cuffie');
  await expect(mediaTile(page)).toHaveAccessibleName('Musica: Artist - Title, in riproduzione');
  // The icon is the action a tap performs: Pause while playing.
  await expect(mediaTile(page).locator('svg[data-icon="pause"]')).toBeVisible();
});

test('tapping the audio tile switches to the other output and back', async ({ page }) => {
  await audioTile(page).click();
  await expect(audioTile(page)).toHaveAccessibleName('Uscita audio: Casse');
  await audioTile(page).click();
  await expect(audioTile(page)).toHaveAccessibleName('Uscita audio: Cuffie');
});

test('tapping the media tile flips the icon and the play state', async ({ page }) => {
  await mediaTile(page).click();
  await expect(mediaTile(page)).toHaveAccessibleName('Musica: Artist - Title, in pausa');
  await expect(mediaTile(page).locator('svg[data-icon="play"]')).toBeVisible();
  await mediaTile(page).click();
  await expect(mediaTile(page)).toHaveAccessibleName('Musica: Artist - Title, in riproduzione');
  await expect(mediaTile(page).locator('svg[data-icon="pause"]')).toBeVisible();
});

test('a change made elsewhere reaches the open page without a reload', async ({ page, pc }) => {
  await expect(mediaTile(page)).toHaveAccessibleName(/in riproduzione/);
  // A second client: the same action over plain HTTP, as a media key or another device would trigger it.
  expect((await playPause(pc)).ok()).toBe(true);
  await expect(mediaTile(page)).toHaveAccessibleName(/in pausa/);
  expect((await playPause(pc)).ok()).toBe(true);
  await expect(mediaTile(page)).toHaveAccessibleName(/in riproduzione/);
});

test('the connection-lost state shows when the socket drops and clears when it is back', async ({ page }) => {
  const sockets = await controlSockets(page);
  // Only a dev server has a hot-reload socket (the e2e runner serves a build); when there is one it must stay open.
  const otherSockets: PageSocket[] = [];
  page.on('websocket', (socket) => {
    if (new URL(socket.url()).pathname !== '/trpc') otherSockets.push(socket);
  });
  await page.goto('/deck');
  await expect(audioTile(page)).toHaveAccessibleName('Uscita audio: Cuffie');
  await expect(page.getByText('Connessione persa')).toBeHidden();

  await sockets.cut();
  // The retry backs off, so the page may need a few seconds: the default 5 s expect timeout is too tight.
  await expect(page.getByText('Connessione persa')).toBeVisible({ timeout: 15_000 });
  expect(otherSockets.every((socket) => !socket.isClosed())).toBe(true);
  // The last known state stays on the tile.
  await expect(audioTile(page)).toHaveAccessibleName(/Cuffie/);

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
    await dot('Studio').click();
    await expect(dot('Studio')).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('region', { name: 'Studio' }).getByRole('button', { name: /^Pomodoro:/ }),
    ).toBeVisible();
    // A swipe is a horizontal scroll of the page strip.
    await page.locator('.deck-pages').evaluate((strip) => strip.scrollTo({ left: 3 * strip.clientWidth }));
    await expect(dot('Sistema')).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(dot('Sistema')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('combobox', { name: 'Aspetto' })).toBeInViewport();
  } finally {
    await page.evaluate(() => localStorage.removeItem('hub.deck.page'));
  }
});

test('the Sistema page chooses the theme of this device', async ({ page }) => {
  await page.getByRole('button', { name: 'Vai a Sistema' }).click();
  try {
    await page.getByRole('combobox', { name: 'Aspetto' }).selectOption({ label: 'Chiaro' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  } finally {
    await page.evaluate(() => {
      localStorage.removeItem('hub.theme');
      localStorage.removeItem('hub.deck.page');
    });
  }
});

test('the player bar shows the track on every page and plays or pauses it', async ({ page }) => {
  const player = page.getByRole('region', { name: 'In riproduzione' });
  await expect(player.getByText('Title', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Vai a Sistema' }).click();
  await expect(player).toBeVisible();
  await player.getByRole('button', { name: 'Metti in pausa la musica' }).click();
  await expect(mediaTile(page)).toHaveAccessibleName(/in pausa/);
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
  await expect(mediaTile(page)).toHaveAccessibleName('Musica: Niente in riproduzione');
  await expect(page.getByRole('region', { name: 'In riproduzione' })).toHaveCount(0);
});

test('the Sistema page locks with a tap and powers off only after a hold', async ({ page }) => {
  await page.getByRole('button', { name: 'Vai a Sistema' }).click();
  try {
    const system = page.getByRole('region', { name: 'Sistema' });
    await expect(system.getByText('212 W')).toBeVisible();
    await system.getByRole('button', { name: /^Blocca:/ }).click();
    await expect(system.getByRole('button', { name: /^Blocca:/ })).toBeEnabled();
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

test('the Notizie tile shows the count as a badge and opens the digest on the PC', async ({ page }) => {
  await page.getByRole('button', { name: 'Vai a Scrivania 2' }).click();
  const tile = page.getByRole('region', { name: 'Scrivania 2' }).getByRole('button', { name: /^Notizie:/ });
  await expect(tile).toHaveAccessibleName('Notizie: Apri sul PC, 22 voci nuove');
  await expect(tile.getByText('22', { exact: true })).toBeVisible();
  await tile.click();
  await expect(tile).toBeEnabled();
  await expect(tile).not.toHaveAccessibleName(/Errore/);
});

test('Posta shows only its unread count and hides the badge at zero', async ({ page, pc }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  try {
    await page.getByRole('button', { name: 'Vai a Scrivania 2' }).click();
    await expect(page.getByRole('group', { name: 'Posta: 3 non lette' })).toBeVisible();
    // Content stays on the PC, so the tile shows the count and is not a button.
    await expect(page.getByRole('button', { name: 'Posta: 3 non lette' })).toHaveCount(0);
    const badges = page.getByRole('navigation', { name: 'Attività' });
    await expect(badges.getByRole('button', { name: 'Posta: 3' })).toBeVisible();
    await pc.post('/trpc/mail.setSeen', { data: { account: 'work', ids: ['310', '308'], seen: true } });
    await pc.post('/trpc/mail.setSeen', { data: { account: 'personal', ids: ['88'], seen: true } });
    await expect(page.getByRole('group', { name: 'Posta: 0 non lette' })).toBeVisible();
    await expect(badges.getByRole('button', { name: /^Posta:/ })).toHaveCount(0);
    expect(requests.filter((url) => /mail\.(list|search|read|threads)/.test(url))).toEqual([]);
  } finally {
    await pc.post('/trpc/mail.setSeen', { data: { account: 'work', ids: ['310', '308'], seen: false } });
    await pc.post('/trpc/mail.setSeen', { data: { account: 'personal', ids: ['88'], seen: false } });
    await page.evaluate(() => localStorage.removeItem('hub.deck.page'));
  }
});

test('Scrivania presents the requested controls in order', async ({ page }) => {
  const desk = page.getByRole('region', { name: 'Scrivania', exact: true });
  await expect(desk.getByRole('button', { name: /^Hub:/ })).toBeVisible();
  await expect(desk.getByRole('button')).toHaveCount(11);
  const names = [
    /^Hub:/,
    /^Chat:/,
    /^Lettore:/,
    /^Uscita audio:/,
    /^Abbassa volume:/,
    /^Alza volume:/,
    /^Microfono:/,
    /^Musica:/,
    /^Brano successivo:/,
    /^Blocca:/,
    /^Pomodoro:/,
  ];
  for (const [index, name] of names.entries())
    await expect(desk.getByRole('button').nth(index)).toHaveAccessibleName(name);
  // The next tile names the track it skips, not the workspace copy.
  await expect(desk.getByRole('button', { name: /^Brano successivo:/ })).toHaveAccessibleName(
    'Brano successivo: Artist - Title',
  );
});

test('badges open the pages containing News and the running Pomodoro', async ({ page, pc }) => {
  const badges = page.getByRole('navigation', { name: 'Attività' });
  try {
    await expect(badges.getByRole('button', { name: /Notizie/ })).toBeVisible();
    await expect(badges.getByRole('button', { name: /Pomodoro/ })).toHaveCount(0);
    expect((await pc.post('/trpc/pomodoro.start', { data: {} })).ok()).toBe(true);
    await badges.getByRole('button', { name: /Pomodoro/ }).click();
    await expect(page.getByRole('region', { name: 'Studio', exact: true })).toBeVisible();
    await badges.getByRole('button', { name: /Notizie/ }).click();
    await expect(page.getByRole('region', { name: 'Scrivania 2', exact: true })).toBeVisible();
    expect((await pc.post('/trpc/pomodoro.stop', { data: {} })).ok()).toBe(true);
    await expect(badges.getByRole('button', { name: /Pomodoro/ })).toHaveCount(0);
  } finally {
    await pc.post('/trpc/pomodoro.stop', { data: {} });
    await page.evaluate(() => localStorage.removeItem('hub.deck.page'));
  }
});

test('all Scrivania controls and the player fit on the phone screen', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'In riproduzione' }).getByText('Title', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('button', { name: /^Pomodoro:/ })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('region', { name: 'In riproduzione' })).toBeInViewport({ ratio: 1 });
});

test('volume and microphone controls update the fake desktop', async ({ page, pc }) => {
  try {
    const down = page.getByRole('button', { name: /^Abbassa volume:/ });
    const up = page.getByRole('button', { name: /^Alza volume:/ });
    await expect(down).toHaveAccessibleName('Abbassa volume: 80%');
    await down.click();
    await expect(up).toHaveAccessibleName('Alza volume: 75%');
    await up.click();
    await expect(down).toHaveAccessibleName('Abbassa volume: 80%');
    const mic = page.getByRole('button', { name: /^Microfono:/ });
    await mic.click();
    await expect(mic).toHaveAccessibleName('Microfono: Disattivato');
    await mic.click();
    await expect(mic).toHaveAccessibleName('Microfono: Attivo');
  } finally {
    const state = (await (await pc.get('/trpc/audio.state')).json()).result.data;
    if (state.micMuted) await pc.post('/trpc/audio.toggleMicMute', { data: {} });
    await pc.post('/trpc/audio.setVolume', { data: { value: 0.8 } });
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
