import { expect, test } from '@playwright/test';
import { answerQueries } from './desktop.ts';
import { freezePomodoro } from './pomodoro-visual.ts';
import { chooseTheme } from './themes.ts';

const examples = process.env.HUB_EXAMPLE_MODULES === '1';

// Each page with a landmark that proves it has rendered, so "nothing here" below cannot pass on an empty screen.
const pages = [
  { path: '/desk/media', landmark: { role: 'region', name: 'Player musicale' } },
  { path: '/desk/system', landmark: { role: 'region', name: 'Questo PC' } },
  { path: '/desk/devices', landmark: { role: 'region', name: 'Chi ha accesso' } },
  { path: '/desk/settings', landmark: { role: 'navigation', name: 'Sezioni' } },
] as const;

// Zone pages and Panoramica share one surface.
const surfacePages = [
  { path: '/desk', landmark: { role: 'region', name: 'Widget' } },
  { path: '/desk/media', landmark: { role: 'region', name: 'Player musicale' } },
  { path: '/desk/system', landmark: { role: 'region', name: 'Questo PC' } },
  { path: '/desk/devices', landmark: { role: 'region', name: 'Chi ha accesso' } },
] as const;

for (const { path, landmark } of surfacePages) {
  test(`${path} has one page surface with flat inner panels, its tabs inside it and no spacer row`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page.getByRole('region', { name: landmark.name }).first()).toBeVisible();
    const surface = page.locator('[data-page-surface]');
    await expect(surface).toHaveCount(1);
    const look = await surface.evaluate((el) => {
      const style = getComputedStyle(el);
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return {
        radius: style.borderTopLeftRadius,
        padding: getComputedStyle(el.querySelector('[data-page-scroller]') ?? el).paddingLeft,
        bottomGap: window.innerHeight - el.getBoundingClientRect().bottom,
        top: el.getBoundingClientRect().top,
        root,
      };
    });
    // Radius xl and padding lg, one xl gap to the window bottom (the same as the top padding of the desk).
    const mainTop = await page.locator('main').evaluate((main) => parseFloat(getComputedStyle(main).paddingTop));
    // Media floats the player over the bottom edge, so it leaves twice the desk padding under the surface (`float`, mb-3xl).
    expect(look.bottomGap).toBe(path === '/desk/media' ? 2 * mainTop : mainTop);
    expect(parseFloat(look.radius)).toBeGreaterThan(parseFloat(look.padding));
    // Step 47c: no spacer row, the surface starts at the desk's top inset. A tab bar is its first row, inside it.
    expect(look.top).toBe(mainTop);
    const tabs = page.getByRole('tablist');
    if (await tabs.count()) {
      const box = await tabs.boundingBox();
      const frame = await surface.boundingBox();
      expect(box!.y).toBeGreaterThan(frame!.y);
      expect(box!.y + box!.height).toBeLessThan(frame!.y + frame!.height);
      expect(box!.x).toBeLessThan(frame!.x + frame!.width / 4);
    }
    // The 1px line the boards draw around the surface (step 47b).
    await expect(surface).toHaveCSS('border-top-width', '1px');
    await expect(surface).toHaveCSS('border-top-style', 'solid');
    // Inner panels: never inside another, never with a border.
    const panels = await page.evaluate(() => ({
      nested: document.querySelectorAll('[data-panel] [data-panel]').length,
      // Panoramica's widget cells keep a hairline, as board I1 draws them (step 68); page panels have none.
      bordered: [...document.querySelectorAll('[data-panel]')].filter(
        (el) => !el.closest('[data-widget]') && getComputedStyle(el).borderTopWidth !== '0px',
      ).length,
      outside: [...document.querySelectorAll('[data-panel]')].filter((el) => !el.closest('[data-page-surface]')).length,
      count: document.querySelectorAll('[data-panel]').length,
    }));
    expect(panels.nested).toBe(0);
    expect(panels.bordered).toBe(0);
    expect(panels.outside).toBe(0);
    // Musica is one surface split by a dashed line (library and content are one thing), so it has no inner panel.
    if (path !== '/desk/media') expect(panels.count).toBeGreaterThan(0);
  });
}

test('every desk page starts its surface at the top inset, with no spacer row', async ({ page }) => {
  for (const { path, landmark } of pages) {
    await page.goto(path);
    await expect(page.getByRole(landmark.role, { name: landmark.name }).first()).toBeVisible();
    const mainTop = await page.locator('main').evaluate((main) => parseFloat(getComputedStyle(main).paddingTop));
    const surface = page.locator('[data-page-surface]');
    expect((await surface.boundingBox())!.y).toBe(mainTop);
  }
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

test('the core settings actions stay in view while the form scrolls past it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  await page.goto('/desk/settings/core');
  const save = page.getByRole('button', { name: 'Salva e riavvia' });
  await expect(save).toBeVisible();
  // Sticky lasts as long as the form does, so scroll part of the way, not to the end of the longer settings list.
  // The settings page scrolls in its own column of the surface.
  const scroller = page.locator('[data-page-surface] section.overflow-y-auto');
  await scroller.evaluate((el) => el.scrollTo(0, 200));
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(save).toBeInViewport();
});

test('the content scrolls to the last row while the title stays fixed', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 500 });
  await page.goto('/desk/system');
  // The Server reading is the last thing on the page, at the foot of the Audio panel.
  const outputs = page.getByRole('region', { name: 'Server' });
  await expect(outputs).toBeVisible();
  // Sistema has tabs (Sistema, Job), so its tab panel is the scroller under the fixed bar.
  const content = page.locator('[data-page-scroller]');
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
  const surface = await page.locator('[data-page-surface]').boundingBox();
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
    const indicator = tabs.locator('svg path').first();
    async function indicatorDistance(tab: typeof devices) {
      const tabBox = await tab.boundingBox();
      if (!tabBox) throw new Error('tab has no box');
      const indicatorX = await indicator.evaluate((element) => {
        if (!(element instanceof SVGPathElement)) return Number.NaN;
        const svg = element.ownerSVGElement;
        return element.getBBox().x + (svg?.getBoundingClientRect().x ?? 0);
      });
      return Math.abs(indicatorX - tabBox.x);
    }
    await expect(tabs.getByRole('tab')).toHaveText(['Dispositivi', 'Esempio']);
    await expect(devices).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => indicatorDistance(devices)).toBeLessThan(4);
    await expect(page.getByRole('tabpanel')).toContainText('Genera codice');
    await expect(page).toHaveURL(/\/desk\/devices$/);
    const entries = await page.evaluate(() => history.length);

    await hello.click();
    await expect(hello).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/desk\/devices\?tab=hello$/);
    await expect.poll(() => indicatorDistance(hello)).toBeLessThan(4);
    await expect(page.getByRole('tabpanel').getByRole('region', { name: 'Esempio', exact: true })).toBeVisible();
    await expect(hello).toBeFocused();
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
    await answerQueries(page, {
      health: { ok: true, uptime: 42 },
      'devices.list': [],
      'agents.localCalls': [],
      'agents.localCallsToday': 0,
    });
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

test('Impostazioni is one surface with the list and the open page as two inner panels, no bordered panel', async ({
  page,
}) => {
  await page.goto('/desk/settings/core');
  await expect(page.getByRole('navigation', { name: 'Sezioni' })).toBeVisible();
  await expect(page.locator('[data-page-surface]')).toHaveCount(1);
  await expect(page.locator('[data-page-surface]')).toHaveCSS('border-top-width', '1px');
  const list = page.getByRole('navigation', { name: 'Sezioni' });
  await expect(list).toHaveAttribute('data-panel', '');
  const panels = await page.evaluate(() => ({
    nested: document.querySelectorAll('[data-panel] [data-panel]').length,
    bordered: [...document.querySelectorAll('[data-panel]')].filter(
      (el) => getComputedStyle(el).borderTopWidth !== '0px',
    ).length,
    outside: [...document.querySelectorAll('[data-panel]')].filter((el) => !el.closest('[data-page-surface]')).length,
    // Any bordered card left in the page would be a Panel drawn outside the surface context.
    cards: [...document.querySelectorAll('main section')].filter(
      (el) => el.classList.contains('rounded-xl') && el.classList.contains('border'),
    ).length,
  }));
  expect(panels).toEqual({ nested: 0, bordered: 0, outside: 0, cards: 0 });
  // The page opens beside the list, inside the surface.
  const surface = await page.locator('[data-page-surface]').boundingBox();
  const listBox = await list.boundingBox();
  const essential = await page.getByRole('region', { name: 'Essenziale' }).boundingBox();
  expect(surface && listBox && essential && essential.x >= listBox.x + listBox.width).toBe(true);
  expect(surface && essential && essential.x + essential.width <= surface.x + surface.width).toBe(true);
});

test('the surface line is 1px in paper too', async ({ page }) => {
  await page.goto('/desk/settings/appearance');
  await chooseTheme(page, 'Chiaro');
  try {
    await page.goto('/desk/devices');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
    await expect(page.locator('[data-page-surface]')).toHaveCSS('border-top-width', '1px');
  } finally {
    await page.evaluate(() => localStorage.removeItem('hub.theme'));
  }
});

test('surface reserves its gutter when content does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/desk/system');
  const panel = page.locator('[data-panel]').first();
  await expect(panel).toBeVisible();
  const right = (await panel.boundingBox())!.x + (await panel.boundingBox())!.width;
  const surface = page.locator('[data-page-scroller]');
  await surface.evaluate((element) => {
    const extra = document.createElement('div');
    extra.style.height = '2000px';
    element.lastElementChild?.append(extra);
  });
  const after = (await panel.boundingBox())!;
  expect(Math.abs(after.x + after.width - right)).toBeLessThanOrEqual(1);
});

for (const width of [1920, 3840]) {
  test(`Dispositivi shows last access, peer IP and pairing expiry at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 3840 ? 2160 : 1080 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date('2026-11-25T12:00:00Z'));
    await answerQueries(page, {
      'devices.list': [
        {
          id: 901,
          name: 'Test phone',
          lastSeenAt: Date.parse('2026-11-25T11:58:00Z'),
          lastSeenIp: '2001:db8:1234:5678:abcd:ef01:2345:6789',
          expiresAt: Date.parse('2027-02-23T12:00:00Z'),
        },
        {
          id: 902,
          name: 'Old phone',
          lastSeenAt: Date.parse('2026-11-24T12:00:00Z'),
          lastSeenIp: null,
          expiresAt: Date.parse('2026-11-25T11:00:00Z'),
        },
      ],
    });
    await page.goto('/desk/devices');
    const phones = page.getByRole('region', { name: 'Telefoni e tablet' });
    await expect(phones.getByText('Ultimo indirizzo: 2001:db8:1234:5678:abcd:ef01:2345:6789')).toBeVisible();
    await expect(phones.getByText('Abbinamento valido fino al 23/02/2027')).toBeVisible();
    await expect(phones.getByText('Abbinamento scaduto: genera un nuovo codice')).toBeVisible();
    await expect(phones).toHaveScreenshot(`device-token-metadata-${width}.png`);
  });
}
