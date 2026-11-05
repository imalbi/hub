import type { Page } from '@playwright/test';
import { playPause, restoreDesktop } from './desktop.ts';
import { expect, test } from './fixtures.ts';
import { controlSockets } from './sockets.ts';

const audioTile = (page: Page) => page.getByRole('button', { name: /^Uscita audio/ });
const mediaTile = (page: Page) => page.getByRole('button', { name: /^Musica/ });

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
  const hotReload = page.waitForEvent('websocket', (socket) => new URL(socket.url()).pathname !== '/trpc');
  await page.goto('/deck');
  const developmentSocket = await hotReload;
  await expect(audioTile(page)).toHaveAccessibleName('Uscita audio: Cuffie');
  await expect(page.getByText('Connessione persa')).toBeHidden();

  await sockets.cut();
  // The retry backs off, so the page may need a few seconds: the default 5 s expect timeout is too tight.
  await expect(page.getByText('Connessione persa')).toBeVisible({ timeout: 15_000 });
  expect(developmentSocket.isClosed()).toBe(false);
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
  const dot = (name: string) => pages.getByRole('button', { name: `Vai a ${name}` });
  try {
    await expect(dot('Scrivania')).toHaveAttribute('aria-current', 'page');
    await dot('Studio').click();
    await expect(dot('Studio')).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('region', { name: 'Studio' }).getByRole('button', { name: /^Pomodoro:/ }),
    ).toBeVisible();
    // A swipe is a horizontal scroll of the page strip.
    await page.locator('.deck-pages').evaluate((strip) => strip.scrollTo({ left: 2 * strip.clientWidth }));
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
  const tile = page.getByRole('button', { name: /^Notizie:/ });
  await expect(tile).toHaveAccessibleName('Notizie: Apri sul PC, 22 voci nuove');
  await expect(tile.getByText('22', { exact: true })).toBeVisible();
  await tile.click();
  await expect(tile).toBeEnabled();
  await expect(tile).not.toHaveAccessibleName(/Errore/);
});
