import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { answerQueries, restoreDesktop } from './desktop.ts';
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

test('the floating activity pill exists only while Pomodoro runs and links to Studio', async ({ page }) => {
  await page.goto('/desk/media');
  await expect(page.getByRole('navigation', { name: 'Zone' })).toBeVisible();
  await expect(page.locator('header').getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Attività in corso' })).toHaveCount(0);
  await freezePomodoro(page, { ...pausedPomodoro, pausedRemainingMs: null, endsAt: Date.now() + 750_000 });
  await page.goto('/desk/media');
  const pill = page.locator('header').getByRole('button', { name: /Studio/ });
  await expect(pill).toBeVisible();
  // One glass region wraps the activity: the pill has no surface of its own.
  const region = page.getByRole('region', { name: 'Attività in corso' });
  await expect(region).toHaveClass(/desk-glass/);
  await expect(region).toHaveCSS('border-top-width', '1px');
  await expect(region.getByRole('button', { name: /Studio/ })).toBeVisible();
  const box = await pill.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.x + box.width > viewport.width / 2 && box.y < 120).toBe(true);
  await pill.click();
  await expect(page).toHaveURL(/\/desk\/studio\/?$/);
});

test('rail labels remain readable when the active link is hovered in either theme', async ({ page }) => {
  await page.goto('/desk/settings/appearance');
  for (const theme of ['Scuro', 'Chiaro']) {
    await chooseTheme(page, theme);
    const active = page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Impostazioni' });
    await active.hover();
    const label = active.locator('.desk-rail-label');
    await expect(label).toHaveCSS('opacity', '1');
    expect(await contrastRatio(label)).toBeGreaterThanOrEqual(4.5);
  }
});

test('the empty devices list uses an accessible empty state', async ({ page }) => {
  await answerQueries(page, { 'devices.list': [] });
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

test('the rail is one pill: trigger, zones and status dot inside, indicator on the current zone', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const view = page.viewportSize();
  if (!view) throw new Error('no viewport');
  await page.goto('/desk');
  const rail = page.getByRole('navigation', { name: 'Zone' });
  const railBox = await rail.boundingBox();
  if (!railBox) throw new Error('no rail box');
  expect(Math.abs(railBox.y + railBox.height / 2 - view.height / 2)).toBeLessThan(2);
  const trigger = rail.getByRole('button', { name: 'Cerca o esegui, scorciatoia Ctrl K' });
  const dot = rail.getByRole('status', { name: 'Connesso', exact: true });
  const links = rail.getByRole('link');
  const inside = async (locator: Locator) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error('no box');
    expect(box.y).toBeGreaterThanOrEqual(railBox.y);
    expect(box.y + box.height).toBeLessThanOrEqual(railBox.y + railBox.height);
    return box;
  };
  const triggerBox = await inside(trigger);
  const dotBox = await inside(dot);
  const firstBox = await inside(links.first());
  const lastBox = await inside(links.last());
  expect(triggerBox.y).toBeLessThan(firstBox.y);
  expect(lastBox.y).toBeLessThan(dotBox.y);
  const indicator = rail.locator('[data-rail-indicator]');
  for (const link of [links.first(), links.last()]) {
    await link.click();
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect
      .poll(async () => {
        const [i, l] = [await indicator.boundingBox(), await link.boundingBox()];
        return i && l ? Math.abs(i.x - l.x) + Math.abs(i.y - l.y) + Math.abs(i.height - l.height) : Infinity;
      })
      .toBeLessThan(1);
  }
});

test('rail selection moves, glass follows the theme and reduced motion stops transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/desk/media');
  const rail = page.getByRole('navigation', { name: 'Zone' });
  const indicator = rail.locator('[data-rail-indicator]');
  await expect(indicator).toBeVisible();
  const before = await indicator.evaluate((element) => getComputedStyle(element).transform);
  await expect(rail).not.toHaveCSS('backdrop-filter', 'none');
  const player = page.getByRole('region', { name: 'Player musicale' });
  await expect(player).not.toHaveCSS('backdrop-filter', 'none');
  await rail.getByRole('link', { name: 'Impostazioni' }).click();
  await expect.poll(() => indicator.evaluate((element) => getComputedStyle(element).transform)).not.toBe(before);
  // Aspetto is a page under the settings list now, so the theme is chosen one step further in.
  await page.getByRole('link', { name: /^Aspetto/ }).click();
  await chooseTheme(page, 'Chiaro');
  await expect(rail).toHaveCSS('backdrop-filter', 'none');
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

test('an action error stays on its button and socket loss turns the rail status dot to the lost state', async ({
  page,
}) => {
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
  const rail = page.getByRole('navigation', { name: 'Zone' });
  await expect(rail.getByRole('status', { name: 'Connesso', exact: true })).toBeVisible();
  await sockets.cut();
  await expect(rail.getByRole('status', { name: 'Connessione persa', exact: true })).toBeVisible();
  await sockets.restore();
  await expect(rail.getByRole('status', { name: 'Connesso', exact: true })).toBeVisible();
});
