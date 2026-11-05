import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { DECK_STATE, PHONE_URL, SERVER_PORT } from './hosts.ts';
import { freezePomodoro } from './pomodoro-visual.ts';

// The fake server's hook for the Hue example light (apps/server/src/testing/fake.ts). Playwright talks to it
// directly: it is not a tRPC route and the Vite proxy only forwards /trpc.
const HOOK = `http://127.0.0.1:${SERVER_PORT}/__fake/hue`;
const change = (request: APIRequestContext, data: object) => request.post(HOOK, { data });
const writes = async (request: APIRequestContext) => (await (await request.get(HOOK)).json()).writes;

async function openDeck(browser: Browser) {
  const context = await browser.newContext({
    storageState: DECK_STATE,
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 3,
  });
  const phone = await context.newPage();
  await freezePomodoro(phone);
  // The deck header shows the server uptime; pin it like the other visual specs.
  await phone.route('**/trpc/health*', (route) =>
    route.fulfill({ json: [{ result: { data: { ok: true, uptime: 42 } } }] }),
  );
  await phone.goto(`${PHONE_URL}/deck`);
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
    const { context, phone } = await openDeck(browser);
    try {
      await page.goto('/desk/devices');
      const panel = page.getByRole('region', { name: 'Luci', exact: true });
      await expect(panel.getByText('Accesa, 80%', { exact: true })).toBeVisible();
      await expect(phone.getByRole('button', { name: 'Luci: Accesa, 80%', exact: true })).toBeVisible();

      await panel.getByRole('button', { name: 'Spegni luce', exact: true }).click();
      await expect(phone.getByRole('button', { name: 'Luci: Spenta', exact: true })).toBeVisible();
      await expect(panel.getByText('Spenta', { exact: true })).toBeVisible();

      await phone.getByRole('button', { name: 'Luci: Spenta', exact: true }).click();
      await expect(panel.getByText('Accesa, 80%', { exact: true })).toBeVisible();
      await expect(phone.getByRole('button', { name: 'Luci: Accesa, 80%', exact: true })).toBeVisible();
      expect(await writes(request)).toEqual([
        { type: 'setPower', on: false },
        { type: 'setPower', on: true },
      ]);
    } finally {
      await context.close();
    }
  });

  test('brightness is written once on release, only while the light is on, and only if the light has it', async ({
    page,
    request,
  }) => {
    await page.goto('/desk/devices');
    const panel = page.getByRole('region', { name: 'Luci', exact: true });
    const slider = panel.getByRole('slider', { name: 'Luminosità' });
    await slider.focus();
    await slider.press('End');
    await expect(panel.getByText('Accesa, 100%', { exact: true })).toBeVisible();
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
    await expect(panel.getByText('Spenta', { exact: true })).toBeVisible();
    await expect(slider).toBeDisabled();

    await change(request, { power: true, capabilities: { power: true, brightness: false } });
    await expect(slider).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Spegni luce', exact: true })).toBeVisible();
    await change(request, { capabilities: { power: false, brightness: false } });
    await expect(panel.getByRole('button', { name: /luce$/ })).toHaveCount(0);
  });

  test('a change made elsewhere reaches both clients, and losing Bluetooth disables the controls until it returns', async ({
    page,
    browser,
    request,
  }) => {
    const { context, phone } = await openDeck(browser);
    try {
      await page.goto('/desk/devices');
      const panel = page.getByRole('region', { name: 'Luci', exact: true });
      const tile = phone.getByRole('button', { name: /^Luci:/ });
      await expect(tile).toBeVisible();

      await change(request, { power: false, brightnessPercent: 20 });
      await expect(panel.getByText('Spenta', { exact: true })).toBeVisible();
      await expect(phone.getByRole('button', { name: 'Luci: Spenta', exact: true })).toBeVisible();

      await change(request, { availability: 'unavailable' });
      await expect(panel.getByText('Senza Bluetooth', { exact: true })).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Accendi luce', exact: true })).toBeDisabled();
      await expect(phone.getByRole('button', { name: 'Luci: Senza Bluetooth', exact: true })).toBeDisabled();
      expect(await writes(request)).toEqual([]);

      await change(request, { availability: 'ready', power: true, brightnessPercent: 55 });
      await expect(panel.getByText('Accesa, 55%', { exact: true })).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Spegni luce', exact: true })).toBeEnabled();
      await expect(phone.getByRole('button', { name: 'Luci: Accesa, 55%', exact: true })).toBeEnabled();
    } finally {
      await context.close();
    }
  });

  test('the Luci widget and the deck tile look right: ready, unavailable, without brightness, paper', async ({
    page,
    browser,
    request,
  }) => {
    const { context, phone } = await openDeck(browser);
    try {
      await freezePomodoro(page);
      await page.goto('/desk/devices');
      const panel = page.getByRole('region', { name: 'Luci', exact: true });
      const deckShot = { animations: 'disabled', scale: 'css' } as const;
      await expect(panel.getByText('Accesa, 80%', { exact: true })).toBeVisible();
      await expect(phone.getByRole('button', { name: 'Luci: Accesa, 80%', exact: true })).toBeVisible();
      await settleFonts(page);
      await settleFonts(phone);
      await expect(panel).toHaveScreenshot('desk-lights.png', { animations: 'disabled' });
      await expect(phone).toHaveScreenshot('deck-lights.png', deckShot);

      await change(request, { availability: 'unavailable' });
      await expect(panel.getByText('Senza Bluetooth', { exact: true })).toBeVisible();
      await expect(phone.getByRole('button', { name: 'Luci: Senza Bluetooth', exact: true })).toBeVisible();
      await expect(panel).toHaveScreenshot('desk-lights-unavailable.png', { animations: 'disabled' });
      await expect(phone).toHaveScreenshot('deck-lights-unavailable.png', deckShot);

      await change(request, { availability: 'ready', capabilities: { power: true, brightness: false } });
      await expect(panel.getByRole('slider')).toHaveCount(0);
      await expect(panel).toHaveScreenshot('desk-lights-power-only.png', { animations: 'disabled' });

      await change(request, { capabilities: { power: true, brightness: true } });
      await page.evaluate(() => localStorage.setItem('hub.theme', 'paper'));
      await page.reload();
      await expect(panel.getByText('Accesa, 80%', { exact: true })).toBeVisible();
      await settleFonts(page);
      await expect(panel).toHaveScreenshot('desk-lights-paper.png', { animations: 'disabled' });
    } finally {
      await page.evaluate(() => localStorage.removeItem('hub.theme'));
      await context.close();
    }
  });

  test('the light widget sits in Dispositivi at 4K and Panoramica does not get it by default', async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await freezePomodoro(page);
    await page.route('**/trpc/health*', (route) =>
      route.fulfill({ json: [{ result: { data: { ok: true, uptime: 42 } } }] }),
    );
    await page.goto('/desk/devices');
    await expect(
      page.getByRole('region', { name: 'Luci', exact: true }).getByText('Accesa, 80%', { exact: true }),
    ).toBeVisible();
    await settleFonts(page);
    // The device list shows last-seen times; this check is about where the light sits.
    await expect(page).toHaveScreenshot('desk-lights-4k.png', {
      animations: 'disabled',
      mask: [page.locator('[data-widget="devices"]')],
    });
    await page.goto('/desk');
    await expect(page.getByRole('region', { name: 'Pomodoro' }).first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Luci', exact: true })).toHaveCount(0);
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
