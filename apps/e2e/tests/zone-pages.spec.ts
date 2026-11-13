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
  { path: '/desk/devices', landmark: { role: 'region', name: 'Chi ha accesso' } },
  { path: '/desk/settings', landmark: { role: 'navigation', name: 'Sezioni' } },
] as const;

// The zone pages (not Impostazioni, not Panoramica): one surface each, step 47.
const surfacePages = [
  { path: '/desk/studio', landmark: { role: 'region', name: 'Pomodoro' } },
  { path: '/desk/media', landmark: { role: 'region', name: 'Player musicale' } },
  { path: '/desk/system', landmark: { role: 'region', name: 'Comandi' } },
  { path: '/desk/devices', landmark: { role: 'region', name: 'Chi ha accesso' } },
  { path: '/desk/messaggi', landmark: { role: 'region', name: 'Posta in arrivo' } },
] as const;

for (const { path, landmark } of surfacePages) {
  test(`${path} has one page surface with flat inner panels, clear of the floating pill`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('region', { name: landmark.name }).first()).toBeVisible();
    const surface = page.locator('[data-page-surface]');
    await expect(surface).toHaveCount(1);
    const look = await surface.evaluate((el) => {
      const style = getComputedStyle(el);
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return {
        radius: style.borderTopLeftRadius,
        padding: style.paddingLeft,
        bottomGap: window.innerHeight - el.getBoundingClientRect().bottom,
        top: el.getBoundingClientRect().top,
        root,
      };
    });
    // Radius xl and padding lg, one xl gap to the window bottom (the same as the top padding of the desk).
    const mainTop = await page.locator('main').evaluate((main) => parseFloat(getComputedStyle(main).paddingTop));
    expect(look.bottomGap).toBe(mainTop);
    expect(parseFloat(look.radius)).toBeGreaterThan(parseFloat(look.padding));
    // Tabs, when there are any, sit above the surface; the first row is reserved either way, so the pill never covers it.
    expect(look.top).toBeGreaterThanOrEqual(mainTop + 44);
    const tabs = page.getByRole('tablist');
    if (await tabs.count()) {
      const box = await tabs.boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(look.top);
    }
    // Inner panels: never inside another, never with a border.
    const panels = await page.evaluate(() => ({
      nested: document.querySelectorAll('[data-panel] [data-panel]').length,
      bordered: [...document.querySelectorAll('[data-panel]')].filter(
        (el) => getComputedStyle(el).borderTopWidth !== '0px',
      ).length,
      outside: [...document.querySelectorAll('[data-panel]')].filter((el) => !el.closest('[data-page-surface]')).length,
      count: document.querySelectorAll('[data-panel]').length,
    }));
    expect(panels.nested).toBe(0);
    expect(panels.bordered).toBe(0);
    expect(panels.outside).toBe(0);
    expect(panels.count).toBeGreaterThan(0);
  });
}

test('the floating activity pill sits in the tab row, never over the surface', async ({ page }) => {
  await page.goto('/desk/devices');
  await expect(page.getByRole('region', { name: 'Chi ha accesso' }).first()).toBeVisible();
  const surfaceTop = await page.locator('[data-page-surface]').evaluate((el) => el.getBoundingClientRect().top);
  const header = await page.locator('main > header').evaluate((el) => el.getBoundingClientRect().top);
  // The header is fixed at the desk padding; its 44px row ends above the surface.
  expect(header + 44).toBeLessThanOrEqual(surfaceTop);
});

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
  // The surface leaves the desk's right gutter, like the rest of the desk content.
  const gutter = await page.locator('main').evaluate((main) => parseFloat(getComputedStyle(main).paddingTop));
  expect(await panel.evaluate((el) => window.innerWidth - el.getBoundingClientRect().right)).toBe(gutter);
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
  // The surface ends one gutter above the window bottom, like the tabs start one gutter below the top.
  const top = await page.locator('main').evaluate((main) => parseFloat(getComputedStyle(main).paddingTop));
  const surface = await content.boundingBox();
  expect(500 - (surface!.y + surface!.height)).toBe(top);
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
    await answerQueries(page, { 'devices.list': [], 'agents.localCalls': [] });
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
    await expect(page.getByRole('region', { name: 'Chi ha accesso' }).first()).toBeVisible();
    await expect(page.getByRole('tablist')).toHaveCount(0);
  });
}
