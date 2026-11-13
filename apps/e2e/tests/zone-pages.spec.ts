import { expect, test } from '@playwright/test';
import { answerQueries } from './desktop.ts';
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

test('the desk scroller reaches the window edge, so its scrollbar is flush', async ({ page }) => {
  await page.goto('/desk/studio');
  await expect(page.getByRole('region', { name: 'Pomodoro' }).first()).toBeVisible();
  const edge = await page.evaluate(() => {
    const main = document.querySelector('main');
    const scroller = main?.querySelector(':scope > div');
    return { right: scroller?.getBoundingClientRect().right, width: window.innerWidth };
  });
  expect(edge.right).toBe(edge.width);
});

test('the tab bar of a long zone page stays in view while the content scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 400 });
  await page.goto('/desk/studio');
  const tabs = page.getByRole('tablist');
  await expect(tabs).toBeVisible();
  // The bar sits outside the scroll: only the tab panel scrolls, its scrollbar at the window edge.
  const panel = page.getByRole('tabpanel');
  await expect(page.getByRole('region', { name: 'Pomodoro' }).first()).toBeVisible();
  await expect.poll(() => panel.evaluate((el) => (el.scrollTo(0, el.scrollHeight), el.scrollTop))).toBeGreaterThan(0);
  await expect(tabs).toBeInViewport();
  const tabsBox = await tabs.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(panelBox!.y).toBeGreaterThanOrEqual(tabsBox!.y + tabsBox!.height);
  expect(await panel.evaluate((el) => el.getBoundingClientRect().right)).toBe(1920);
});

test('the core settings actions stay in view while the form scrolls past it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 300 });
  await page.goto('/desk/settings/core');
  const save = page.getByRole('button', { name: 'Salva e riavvia' });
  await expect(save).toBeVisible();
  // Sticky lasts as long as the form does, so scroll part of the way, not to the end of the longer settings list.
  const scroller = page.locator('main > div').last();
  await scroller.evaluate((el) => el.scrollTo(0, 200));
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(save).toBeInViewport();
});

test('the content scrolls to the last row while the title stays fixed', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 500 });
  await page.goto('/desk/system');
  const outputs = page.getByRole('toolbar', { name: 'Uscite configurate' });
  await expect(outputs).toBeVisible();
  // Sistema has tabs (Sistema, Job), so its tab panel is the scroller under the fixed bar.
  const content = page.getByRole('tabpanel');
  const title = page.getByRole('heading', { level: 1, name: 'Sistema' });
  await content.hover();
  await expect
    .poll(() =>
      page
        .locator('main')
        .evaluate(
          (element) =>
            element
              .getAnimations({ subtree: true })
              .filter(
                (animation) =>
                  animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime),
              ).length,
        ),
    )
    .toBe(0);
  const before = await title.boundingBox();
  await page.mouse.wheel(0, 3000);
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const after = await title.boundingBox();
  expect(after?.y).toBe(before?.y);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const last = await outputs.boundingBox();
  if (!last) throw new Error('missing box');
  expect(last.y + last.height).toBeLessThanOrEqual(500);
  // The page ends one gutter below its last row, like it starts one gutter above the title (the gutter is inside the scrolling panel).
  const top = await page.locator('main').evaluate((main) => getComputedStyle(main).paddingTop);
  expect(await content.evaluate((panel) => getComputedStyle(panel).paddingBottom)).toBe(top);
});

if (examples) {
  test('Dispositivi has two tabs: click and arrows switch them, the URL follows and a reload keeps the tab', async ({
    page,
  }) => {
    await page.goto('/desk/devices');
    const tabs = page.getByRole('tablist', { name: 'Sezioni' });
    const devices = tabs.getByRole('tab', { name: 'Dispositivi' });
    const hello = tabs.getByRole('tab', { name: 'Esempio' });
    await expect(tabs.getByRole('tab')).toHaveText(['Dispositivi', 'Esempio']);
    await expect(devices).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toContainText('Genera codice');
    await expect(page).toHaveURL(/\/desk\/devices$/);
    const entries = await page.evaluate(() => history.length);

    await hello.click();
    await expect(hello).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/desk\/devices\?tab=hello$/);
    await expect(page.getByRole('tabpanel').getByRole('region', { name: 'Esempio', exact: true })).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(devices).toHaveAttribute('aria-selected', 'true');
    await expect(devices).toBeFocused();
    await expect(page).toHaveURL(/\/desk\/devices$/);
    await page.keyboard.press('End');
    await expect(hello).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(devices).toHaveAttribute('aria-selected', 'true');
    // A click replaces the history entry: no trail of tabs behind the back button.
    expect(await page.evaluate(() => history.length)).toBe(entries);

    await hello.click();
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Esempio' })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/desk\/devices\?tab=hello$/);
  });

  test('a deep link opens its tab and an unknown tab falls back to the first', async ({ page }) => {
    await page.goto('/desk/devices?tab=hello');
    await expect(page.getByRole('tab', { name: 'Esempio' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel').getByRole('region', { name: 'Esempio', exact: true })).toBeVisible();
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
    await answerQueries(page, { 'devices.list': [] });
    await page.goto('/desk/devices');
    await expect(page.getByRole('tablist', { name: 'Sezioni' })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.mouse.move(0, 0);
    // The example row shows a greeting count that other example specs raise.
    await expect(page).toHaveScreenshot('desk-devices-tabs.png', {
      animations: 'disabled',
      mask: [page.getByRole('group', { name: 'Esempio', exact: true })],
    });
  });
} else {
  test('without a section Dispositivi shows no tab bar and ?tab= changes nothing', async ({ page }) => {
    await page.goto('/desk/devices?tab=hello');
    await expect(page.getByRole('region', { name: 'Dispositivi' }).first()).toBeVisible();
    await expect(page.getByRole('tablist')).toHaveCount(0);
  });
}
