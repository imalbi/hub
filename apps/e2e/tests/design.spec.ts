import { expect, test } from './fixtures.ts';
import { restoreDesktop } from './desktop.ts';
import { controlSockets } from './sockets.ts';
import { contrastRatio } from './contrast.ts';
import { freezePomodoro, pausedPomodoro } from './pomodoro-visual.ts';
import { chooseTheme } from './themes.ts';

test.afterEach(async ({ pc }) => restoreDesktop(pc));

for (const initial of [null, { key: 'other-track', dataUrl: 'data:image/png;base64,AA==' }]) {
  test(`artwork recovers after an initial ${initial === null ? 'missing' : 'mismatched'} response`, async ({
    page,
  }) => {
    let requests = 0;
    await page.route('**/trpc/media.art*', async (route) => {
      requests++;
      if (requests === 1) await route.fulfill({ json: [{ result: { data: initial } }] });
      else await route.continue();
    });
    await page.goto('/desk/media');
    await expect(page.getByRole('img', { name: 'Copertina di Title', exact: true })).toBeVisible({ timeout: 10_000 });
    expect(requests).toBe(2);
  });
}

test('the visible countdown ticks without changing its live announcement', async ({ page }) => {
  const now = new Date('2026-11-04T12:00:00Z');
  await page.clock.install({ time: now });
  await freezePomodoro(page, { ...pausedPomodoro, pausedRemainingMs: null, endsAt: now.getTime() + 750_000 });
  await page.goto('/desk');
  const header = page.locator('header');
  const announcement = header.getByRole('status').filter({ hasText: 'Concentrazione' });
  await expect(announcement).toHaveText('Concentrazione');
  await expect(announcement).toHaveAttribute('aria-live', 'polite');
  await announcement.evaluate((element) => {
    element.setAttribute('data-mutations', '0');
    new MutationObserver((records) =>
      element.setAttribute('data-mutations', String(Number(element.getAttribute('data-mutations')) + records.length)),
    ).observe(element, { childList: true, characterData: true, subtree: true });
  });
  const activity = header.getByRole('button', { name: /Studio/ });
  const before = await activity.innerText();
  await page.clock.fastForward(1000);
  await expect.poll(() => activity.innerText()).not.toBe(before);
  await expect(announcement).toHaveText('Concentrazione');
  await expect(announcement).toHaveAttribute('data-mutations', '0');
});

test('rail labels remain readable when the active link is hovered in either theme', async ({ page }) => {
  await page.goto('/desk/devices');
  for (const theme of ['Scuro', 'Chiaro']) {
    await chooseTheme(page, theme);
    const active = page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Dispositivi' });
    await active.hover();
    const label = active.locator('.desk-rail-label');
    await expect(label).toHaveCSS('opacity', '1');
    expect(await contrastRatio(label)).toBeGreaterThanOrEqual(4.5);
  }
});

test('the empty devices list uses an accessible empty state', async ({ page }) => {
  await page.route('**/trpc/devices.list*', (route) => route.fulfill({ json: [{ result: { data: [] } }] }));
  await page.goto('/desk/devices');
  await expect(page.getByRole('heading', { name: 'Nessun dispositivo abbinato' })).toBeVisible();
  await expect(page.getByText('Il deck si collega con un codice temporaneo.')).toBeVisible();
});

test('the header activity opens Studio while a focus phase runs', async ({ page, pc }) => {
  await page.goto('/desk');
  await page.getByRole('button', { name: 'Avvia', exact: true }).click();
  try {
    await page.locator('header').getByRole('button', { name: 'Apri Studio', exact: true }).click();
    await expect(page).toHaveURL(/\/desk\/studio$/);
  } finally {
    await pc.post('/trpc/pomodoro.stop', { data: {} });
  }
});

test('Media exposes the cover and floating player controls drive the fake track', async ({ page }) => {
  await page.goto('/desk/media');
  await expect(page.getByRole('img', { name: 'Copertina di Title', exact: true })).toBeVisible();
  const player = page.getByRole('region', { name: 'Player musicale' });
  await expect(player).toBeVisible();
  await player.getByRole('button', { name: 'Brano successivo' }).click();
  await expect(page.getByRole('img', { name: 'Copertina di Second Title', exact: true })).toBeVisible();
  await player.getByRole('button', { name: 'Brano precedente' }).click();
  await expect(page.getByRole('img', { name: 'Copertina di Title', exact: true })).toBeVisible();
  await player.getByRole('button', { name: 'Metti in pausa la musica' }).click();
  await expect(player.getByRole('button', { name: 'Riproduci musica' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Panoramica' }).click();
  await expect(page.getByRole('img', { name: 'Copertina di Title', exact: true })).toBeVisible();
});

test('rail selection moves, glass follows the theme and reduced motion stops transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/desk/media');
  const rail = page.getByRole('navigation', { name: 'Zone' });
  const indicator = rail.locator('[data-rail-indicator]');
  await expect(indicator).toBeVisible();
  const before = await indicator.evaluate((element) => getComputedStyle(element).transform);
  await expect(rail.locator('.desk-glass')).not.toHaveCSS('backdrop-filter', 'none');
  const player = page.getByRole('region', { name: 'Player musicale' });
  await expect(player).not.toHaveCSS('backdrop-filter', 'none');
  await rail.getByRole('link', { name: 'Dispositivi' }).click();
  await expect.poll(() => indicator.evaluate((element) => getComputedStyle(element).transform)).not.toBe(before);
  await chooseTheme(page, 'Chiaro');
  await expect(rail.locator('.desk-glass')).toHaveCSS('backdrop-filter', 'none');
  await rail.getByRole('link', { name: 'Media', exact: true }).click();
  await expect(player).toHaveCSS('backdrop-filter', 'none');
  await expect(indicator).toHaveCSS('transition-duration', '0s');
  await player.getByRole('button', { name: 'Metti in pausa la musica' }).click();
  await expect(player.getByRole('button', { name: 'Riproduci musica' })).toBeVisible();
  expect(
    await player.evaluate(
      (element) =>
        element.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length,
    ),
  ).toBe(0);
});

test('an action error stays on its button and socket loss dims the header badge', async ({ page }) => {
  const sockets = await controlSockets(page);
  await page.goto('/desk/media');
  await page.route('**/trpc/media.next*', (route) =>
    route.fulfill({
      status: 412,
      json: [
        {
          error: {
            message: 'Fixture failure',
            code: -32012,
            data: { code: 'PRECONDITION_FAILED', httpStatus: 412, path: 'media.next' },
          },
        },
      ],
    }),
  );
  const next = page.getByRole('button', { name: 'Brano successivo' });
  await next.click();
  await expect(next).toHaveAttribute('data-status', 'error');
  await expect(page.getByRole('status', { name: 'Connessione al server' })).toHaveCSS('opacity', '1');
  await sockets.cut();
  await expect(page.getByRole('status', { name: 'Connessione al server' })).toHaveCSS('opacity', '0.6');
  await sockets.restore();
});
