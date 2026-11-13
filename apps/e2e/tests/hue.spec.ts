import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { DECK_STATE, PHONE_URL, SERVER_URL } from './hosts.ts';
import { answerQueries } from './desktop.ts';
import { controlSockets } from './sockets.ts';
import { freezePomodoro } from './pomodoro-visual.ts';

// The fake server's hook for the Hue example light (apps/server/src/testing/fake.ts). Playwright talks to it
// directly: it is not a tRPC route and the Vite proxy only forwards /trpc.
const HOOK = `${SERVER_URL}/__fake/hue`;
const change = (request: APIRequestContext, data: object) => request.post(HOOK, { data });
const writes = async (request: APIRequestContext) => (await (await request.get(HOOK)).json()).writes;

async function openDeck(browser: Browser) {
  const context = await browser.newContext({
    storageState: DECK_STATE,
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 3,
  });
  const phone = await context.newPage();
  await phone.emulateMedia({ reducedMotion: 'reduce' });
  await freezePomodoro(phone);
  // The deck header shows the server uptime; pin it like the other visual specs.
  await phone.route('**/trpc/health*', (route) =>
    route.fulfill({ json: [{ result: { data: { ok: true, uptime: 42 } } }] }),
  );
  await phone.goto(`${PHONE_URL}/deck`);
  await phone.getByRole('button', { name: 'Vai a Scrivania 2' }).click();
  return { context, phone };
}

async function settleFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.mouse.move(0, 0);
}

if (process.env.HUB_EXAMPLE_MODULES === '1') {
  test.afterEach(({ request }) => change(request, { reset: true }));

  test('the desk panel and the deck tile drive one light and follow each other', async ({ page, browser, request }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    const { context, phone } = await openDeck(browser);
    try {
      await page.goto('/desk/devices');
      const panel = page.getByRole('group', { name: 'Luci', exact: true });
      await expect(panel.getByRole('paragraph').filter({ hasText: /^Accesa, 80%$/ })).toBeVisible();
      await expect(phone.getByRole('button', { name: 'Luci: Accesa, 80%', exact: true })).toBeVisible();

      const toggle = panel.getByRole('button', { name: /^Luce:/ });
      const bulb = phone.getByRole('button', { name: /^Luci:/ }).locator('svg[data-icon="lightbulb"]');
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(toggle).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(bulb).toHaveAttribute('data-weight', 'fill');
      await expect(toggle.locator('svg[data-icon="lightbulb"]')).toHaveAttribute('data-weight', 'fill');
      await toggle.click();
      await expect(phone.getByRole('button', { name: 'Luci: Spenta', exact: true })).toBeVisible();
      await expect(panel.getByRole('paragraph').filter({ hasText: /^Spenta$/ })).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await page.mouse.move(0, 0);
      await expect(toggle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(bulb).toHaveAttribute('data-weight', 'regular');
      await expect(toggle.locator('svg[data-icon="lightbulb"]')).toHaveAttribute('data-weight', 'regular');
      expect(await writes(request)).toEqual([{ type: 'setPower', on: false }]);

      await phone.getByRole('button', { name: 'Luci: Spenta', exact: true }).click();
      await expect(panel.getByRole('paragraph').filter({ hasText: /^Accesa, 80%$/ })).toBeVisible();
      await expect(phone.getByRole('button', { name: 'Luci: Accesa, 80%', exact: true })).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(toggle).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(bulb).toHaveAttribute('data-weight', 'fill');
      expect(await writes(request)).toEqual([
        { type: 'setPower', on: false },
        { type: 'setPower', on: true },
      ]);
    } finally {
      await context.close();
    }
  });

  test('the icon toggle keeps pending, success and error feedback and writes once', async ({ page, request }) => {
    await page.goto('/desk/devices');
    const panel = page.getByRole('group', { name: 'Luci', exact: true });
    const toggle = panel.getByRole('button', { name: /^Luce:/ });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/trpc/hue.setPower*', async (route) => {
      await gate;
      await route.continue();
    });
    try {
      await toggle.click();
      await expect(toggle).toHaveAttribute('data-status', 'pending');
      await expect(toggle).toHaveAttribute('aria-busy', 'true');
      await toggle.evaluate((button: HTMLButtonElement) => button.click());
      expect(await writes(request)).toEqual([]);
      release?.();
      await expect(toggle).toHaveAttribute('data-status', 'success');
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(await writes(request)).toEqual([{ type: 'setPower', on: false }]);
      await page.unroute('**/trpc/hue.setPower*');
      await page.route('**/trpc/hue.setPower*', (route) =>
        route.fulfill({
          status: 503,
          json: [
            {
              error: { message: 'unavailable', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 503 } },
            },
          ],
        }),
      );
      await toggle.click();
      await expect(toggle).toHaveAttribute('data-status', 'error');
      await expect(panel.getByRole('alert')).toHaveText('Stato sconosciuto');
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(await writes(request)).toEqual([{ type: 'setPower', on: false }]);
    } finally {
      release?.();
    }
  });

  test('brightness is written once on release, only while the light is on, and only if the light has it', async ({
    page,
    request,
  }) => {
    await page.goto('/desk/devices');
    const panel = page.getByRole('group', { name: 'Luci', exact: true });
    const slider = panel.getByRole('slider', { name: 'Luminosità' });
    await slider.focus();
    await slider.press('End');
    await expect(panel.getByRole('paragraph').filter({ hasText: /^Accesa, 100%$/ })).toBeVisible();
    expect(await writes(request)).toEqual([{ type: 'setBrightness', percent: 100 }]);

    const box = await slider.boundingBox();
    if (!box) throw new Error('slider has no box');
    await slider.click({ position: { x: box.width / 4, y: box.height / 2 } });
    await expect.poll(async () => (await writes(request)).length).toBe(2);
    const [, second] = await writes(request);
    expect(second.percent).toBeGreaterThan(1);
    expect(second.percent).toBeLessThan(60);
    await expect(slider).toHaveValue(String(second.percent));

    await change(request, { power: false });
    await expect(panel.getByRole('paragraph').filter({ hasText: /^Spenta$/ })).toBeVisible();
    await expect(slider).toBeDisabled();

    await change(request, { power: true, capabilities: { power: true, brightness: false } });
    await expect(slider).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /^Luce: Accesa/ })).toBeVisible();
    await change(request, { capabilities: { power: false, brightness: false } });
    await expect(panel.getByRole('button', { name: /^Luce:/ })).toHaveCount(0);
  });

  test('a change made elsewhere reaches both clients, and losing Bluetooth disables the controls until it returns', async ({
    page,
    browser,
    request,
  }) => {
    const { context, phone } = await openDeck(browser);
    try {
      await page.goto('/desk/devices');
      const panel = page.getByRole('group', { name: 'Luci', exact: true });
      const tile = phone.getByRole('button', { name: /^Luci:/ });
      const toggle = panel.getByRole('button', { name: /^Luce:/ });
      await expect(tile).toBeVisible();

      await change(request, { power: false, brightnessPercent: 20 });
      await expect(panel.getByRole('paragraph').filter({ hasText: /^Spenta$/ })).toBeVisible();
      await expect(phone.getByRole('button', { name: 'Luci: Spenta', exact: true })).toBeVisible();

      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await expect(tile.locator('svg[data-icon="lightbulb"]')).toHaveAttribute('data-weight', 'regular');
      await change(request, { availability: 'unavailable' });
      await expect(panel.getByRole('paragraph').filter({ hasText: /^Senza Bluetooth$/ })).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Luce: Senza Bluetooth', exact: true })).toBeDisabled();
      await expect(phone.getByRole('button', { name: 'Luci: Senza Bluetooth', exact: true })).toBeDisabled();
      expect(await writes(request)).toEqual([]);

      await change(request, { availability: 'ready', power: true, brightnessPercent: 55 });
      await expect(panel.getByRole('paragraph').filter({ hasText: /^Accesa, 55%$/ })).toBeVisible();
      await expect(panel.getByRole('button', { name: /^Luce: Accesa/ })).toBeEnabled();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(tile.locator('svg[data-icon="lightbulb"]')).toHaveAttribute('data-weight', 'fill');
      await expect(phone.getByRole('button', { name: 'Luci: Accesa, 55%', exact: true })).toBeEnabled();
    } finally {
      await context.close();
    }
  });

  test('losing Hub disables the light toggle until the socket recovers', async ({ page, request }) => {
    const sockets = await controlSockets(page);
    await page.goto('/desk/devices');
    const toggle = page.getByRole('group', { name: 'Luci', exact: true }).getByRole('button', { name: /^Luce:/ });
    await expect(toggle).toBeEnabled();
    await sockets.cut();
    await expect(toggle).toBeDisabled({ timeout: 15_000 });
    expect(await writes(request)).toEqual([]);
    await sockets.restore();
    await expect(toggle).toBeEnabled({ timeout: 15_000 });
  });

  test('the light row and the deck tile look right: ready, unavailable, without brightness, paper', async ({
    page,
    browser,
    request,
  }) => {
    const { context, phone } = await openDeck(browser);
    try {
      await freezePomodoro(page);
      await page.goto('/desk/devices');
      const panel = page.getByRole('group', { name: 'Luci', exact: true });
      const deckShot = { animations: 'disabled', scale: 'css' } as const;
      await expect(panel.getByRole('paragraph').filter({ hasText: /^Accesa, 80%$/ })).toBeVisible();
      await expect(phone.getByRole('button', { name: 'Luci: Accesa, 80%', exact: true })).toBeVisible();
      await settleFonts(page);
      await settleFonts(phone);
      await expect(panel).toHaveScreenshot('desk-lights.png', { animations: 'disabled' });
      await expect(phone).toHaveScreenshot('deck-lights.png', deckShot);

      await change(request, { availability: 'unavailable' });
      await expect(panel.getByRole('paragraph').filter({ hasText: /^Senza Bluetooth$/ })).toBeVisible();
      await expect(phone.getByRole('button', { name: 'Luci: Senza Bluetooth', exact: true })).toBeVisible();
      await expect(panel).toHaveScreenshot('desk-lights-unavailable.png', { animations: 'disabled' });
      await expect(phone).toHaveScreenshot('deck-lights-unavailable.png', deckShot);

      await change(request, { availability: 'ready', capabilities: { power: true, brightness: false } });
      await expect(panel.getByRole('slider')).toHaveCount(0);
      await expect(panel).toHaveScreenshot('desk-lights-power-only.png', { animations: 'disabled' });

      await change(request, { capabilities: { power: true, brightness: true } });
      await page.evaluate(() => localStorage.setItem('hub.theme', 'paper'));
      await page.reload();
      await expect(panel.getByRole('paragraph').filter({ hasText: /^Accesa, 80%$/ })).toBeVisible();
      await settleFonts(page);
      await expect(panel).toHaveScreenshot('desk-lights-paper.png', { animations: 'disabled' });
    } finally {
      await page.evaluate(() => localStorage.removeItem('hub.theme'));
      await context.close();
    }
  });

  test('the light is a row of Dispositivi at 4K and Panoramica does not get its widget by default', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await freezePomodoro(page);
    await page.route('**/trpc/health*', (route) =>
      route.fulfill({ json: [{ result: { data: { ok: true, uptime: 42 } } }] }),
    );
    // The paired devices come from the run's own database; the shot is about the rows.
    await answerQueries(page, { 'devices.list': [], 'agents.localCalls': [] });
    await page.goto('/desk/devices');
    await expect(
      page.getByRole('group', { name: 'Luci', exact: true }).getByText('Accesa, 80%', { exact: true }),
    ).toBeVisible();
    await settleFonts(page);
    await expect(page).toHaveScreenshot('desk-lights-4k.png', { animations: 'disabled' });
    await page.goto('/desk');
    await expect(page.getByRole('region', { name: 'Pomodoro' }).first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Luci', exact: true })).toHaveCount(0);
  });

  test('Panoramica offers the Luci widget and it drives the same light', async ({ page, request }) => {
    await page.goto('/desk');
    await page.getByRole('button', { name: 'Modifica' }).click();
    await page.getByRole('button', { name: 'Aggiungi Luci' }).click();
    await page.getByRole('button', { name: 'Fine' }).click();
    try {
      const widget = page.locator('[data-widget="lights"]');
      await expect(widget.getByText('Accesa, 80%', { exact: true })).toBeVisible();
      await widget.getByRole('button', { name: /^Luce:/ }).click();
      await expect(widget.getByText('Spenta', { exact: true })).toBeVisible();
      expect(await writes(request)).toEqual([{ type: 'setPower', on: false }]);
    } finally {
      await page.getByRole('button', { name: 'Modifica' }).click();
      await page.getByRole('button', { name: 'Rimuovi Luci' }).click();
      await page.getByRole('button', { name: 'Fine' }).click();
    }
  });

  test('the light tile stays within the deck page without vertical scroll', async ({ browser }) => {
    const { context, phone } = await openDeck(browser);
    try {
      await expect(phone.getByRole('button', { name: /^Luci:/ })).toBeVisible();
      const overflow = await phone.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      expect(overflow).toBeLessThanOrEqual(0);
    } finally {
      await context.close();
    }
  });
} else {
  test('the light is absent without the example flag', async ({ page, request }) => {
    await page.goto('/desk/devices');
    await expect(page.getByRole('region', { name: 'Luci', exact: true })).toHaveCount(0);
    expect((await request.get('/trpc/hue.state')).status()).toBe(404);
    expect((await request.get(HOOK)).status()).toBe(404);
  });
}
