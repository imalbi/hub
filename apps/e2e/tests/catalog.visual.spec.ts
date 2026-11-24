import { expect, test } from './fixtures.ts';
import { CATALOG_URL, catalogState, cleanCatalog } from './catalog.ts';
import { freezePomodoro } from './pomodoro-visual.ts';

const NOW = new Date('2026-11-24T12:00:00Z');
test.beforeEach(async ({ page, pc }) => {
  await cleanCatalog(pc);
  await pc.post('/trpc/catalog.addSource', { data: { url: CATALOG_URL } });
  const source = (await catalogState(pc)).sources[0];
  await pc.post('/trpc/catalog.install', { data: { sourceId: source?.id, name: 'catalog-demo', confirmed: true } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await freezePomodoro(page);
  await page.clock.setFixedTime(NOW);
  await page.route('**/trpc/*', async (route) => {
    const paths = new URL(route.request().url()).pathname.replace('/trpc/', '').split(',');
    if (!paths.includes('catalog.state') && !paths.includes('health') && !paths.includes('settings.modules'))
      return route.continue();
    const response = await route.fetch();
    const body: unknown = await response.json();
    if (Array.isArray(body))
      for (const [index, entry] of body.entries()) {
        if (paths[index] === 'health' && entry?.result) entry.result.data = { ok: true, uptime: 42 };
        if (paths[index] === 'catalog.state')
          for (const source of entry?.result?.data?.sources ?? []) source.lastSyncedAt = NOW.getTime();
        if (paths[index] === 'settings.modules')
          for (const module of entry?.result?.data ?? []) if (module.name === 'weather') module.note = 'manca la città';
      }
    return route.fulfill({ response, json: body });
  });
});
test.afterEach(async ({ page, pc }) => {
  await page.unrouteAll({ behavior: 'wait' });
  await page.close();
  await cleanCatalog(pc);
});

for (const size of [
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
]) {
  test(`catalog at ${size.width} matches the settings layout`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/desk/settings/catalog');
    const source = page.getByRole('region', { name: 'Catalogo esempio' });
    await expect(source).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(
      `desk-settings-catalog-${size.width}${process.env.HUB_EXAMPLE_MODULES === '1' ? '-example' : ''}.png`,
      { animations: 'disabled' },
    );
    if (size.width === 1920) {
      await source.evaluate((element) => {
        const scroller = element.closest('section.overflow-y-auto');
        if (scroller && element instanceof HTMLElement) scroller.scrollTop = element.offsetTop;
      });
      await expect(page).toHaveScreenshot(
        `desk-settings-catalog-modules-1920${process.env.HUB_EXAMPLE_MODULES === '1' ? '-example' : ''}.png`,
        { animations: 'disabled' },
      );
    }
  });
}
