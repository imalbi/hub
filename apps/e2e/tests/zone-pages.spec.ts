import { expect, test } from '@playwright/test';
import { freezePomodoro } from './pomodoro-visual.ts';
import { chooseTheme } from './themes.ts';

const examples = process.env.HUB_EXAMPLE_MODULES === '1';

// Each page with a landmark that proves it has rendered, so "nothing here" below cannot pass on an empty screen.
const pages = [
  { path: '/desk/studio', landmark: { role: 'region', name: 'Pomodoro' } },
  { path: '/desk/media', landmark: { role: 'region', name: 'Player musicale' } },
  { path: '/desk/system', landmark: { role: 'region', name: 'Comandi' } },
  { path: '/desk/devices', landmark: { role: 'region', name: 'Dispositivi' } },
  { path: '/desk/settings', landmark: { role: 'navigation', name: 'Sezioni' } },
] as const;

for (const { path, landmark } of pages) {
  test(`${path} is a page: no Modifica, no widget grid`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole(landmark.role, { name: landmark.name }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Widget', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-widget]')).toHaveCount(0);
  });
}

test('Impostazioni shows the Aspetto picker and a chosen theme applies', async ({ page }) => {
  await page.goto('/desk/settings/appearance');
  await expect(page.getByRole('heading', { level: 1, name: 'Impostazioni' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Aspetto' })).toBeVisible();
  // Aspetto is a page of its own under the settings list, not a tab: no bar.
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await chooseTheme(page, 'Chiaro');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await page.evaluate(() => localStorage.removeItem('hub.theme'));
});

test('the last row of a page is fully visible with no bottom clearance for a floating layer', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 500 });
  await page.goto('/desk/media');
  const outputs = page.getByRole('toolbar', { name: 'Uscite configurate' });
  await expect(outputs).toBeVisible();
  await outputs.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = await outputs.boundingBox();
  if (!last) throw new Error('missing box');
  expect(last.y + last.height).toBeLessThanOrEqual(500);
  // The page ends one gutter below its last row, like it starts one gutter above the title.
  const padding = await page
    .locator('main')
    .evaluate((main) => [getComputedStyle(main).paddingTop, getComputedStyle(main).paddingBottom]);
  expect(padding[1]).toBe(padding[0]);
});

if (examples) {
  test('Dispositivi has two tabs: click and arrows switch them, the URL follows and a reload keeps the tab', async ({
    page,
  }) => {
    await page.goto('/desk/devices');
    const tabs = page.getByRole('tablist', { name: 'Sezioni' });
    const devices = tabs.getByRole('tab', { name: 'Dispositivi' });
    const lights = tabs.getByRole('tab', { name: 'Luci' });
    await expect(tabs.getByRole('tab')).toHaveText(['Dispositivi', 'Luci']);
    await expect(devices).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toContainText('Genera codice');
    await expect(page).toHaveURL(/\/desk\/devices$/);
    const entries = await page.evaluate(() => history.length);

    await lights.click();
    await expect(lights).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/desk\/devices\?tab=luci$/);
    await expect(page.getByRole('tabpanel').getByRole('region', { name: 'Luci', exact: true })).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(devices).toHaveAttribute('aria-selected', 'true');
    await expect(devices).toBeFocused();
    await expect(page).toHaveURL(/\/desk\/devices$/);
    await page.keyboard.press('End');
    await expect(lights).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(devices).toHaveAttribute('aria-selected', 'true');
    // A click replaces the history entry: no trail of tabs behind the back button.
    expect(await page.evaluate(() => history.length)).toBe(entries);

    await lights.click();
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Luci' })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/desk\/devices\?tab=luci$/);
  });

  test('a deep link opens its tab and an unknown tab falls back to the first', async ({ page }) => {
    await page.goto('/desk/devices?tab=luci');
    await expect(page.getByRole('tab', { name: 'Luci' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel').getByRole('region', { name: 'Luci', exact: true })).toBeVisible();
    await page.goto('/desk/devices?tab=nope');
    await expect(page.getByRole('tab', { name: 'Dispositivi' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toContainText('Genera codice');
  });

  test('a section turns a one-tab page into a page with a bar, and the tab bar matches the baseline', async ({
    page,
  }) => {
    await freezePomodoro(page);
    await page.route('**/trpc/health*', (route) =>
      route.fulfill({ json: [{ result: { data: { ok: true, uptime: 42 } } }] }),
    );
    await page.route('**/trpc/devices.list*', (route) => route.fulfill({ json: [{ result: { data: [] } }] }));
    await page.goto('/desk/devices');
    await expect(page.getByRole('tablist', { name: 'Sezioni' })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('desk-devices-tabs.png', { animations: 'disabled' });
  });
} else {
  test('without a section Dispositivi shows no tab bar and ?tab= changes nothing', async ({ page }) => {
    await page.goto('/desk/devices?tab=luci');
    await expect(page.getByRole('region', { name: 'Dispositivi' }).first()).toBeVisible();
    await expect(page.getByRole('tablist')).toHaveCount(0);
  });
}
