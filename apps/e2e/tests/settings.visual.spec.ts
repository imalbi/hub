import { expect, test } from '@playwright/test';
import { freezePomodoro } from './pomodoro-visual.ts';

// The settings list and two module pages at 4K, the size the desk is made for. The header's Pomodoro badge is the only
// thing that moves on these pages, so it is pinned like in `desk.visual.spec.ts`.
const NOW = new Date('2026-11-04T12:00:00Z');
const suffix = process.env.HUB_EXAMPLE_MODULES === '1' ? '-example' : '';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await freezePomodoro(page);
  await page.clock.setFixedTime(NOW);
  // Whether a `.bak` exists depends on which spec of this process saved before: the restore row is not under test here.
  await page.route('**/trpc/**', async (route) => {
    const paths = new URL(route.request().url()).pathname.replace('/trpc/', '').split(',');
    if (!paths.includes('settings.config') && !paths.includes('settings.modules') && !paths.includes('health'))
      return route.continue();
    const response = await route.fetch();
    const body: unknown = await response.json();
    if (Array.isArray(body))
      for (const [index, entry] of body.entries())
        if (paths[index] === 'health' && entry?.result) entry.result.data = { ok: true, uptime: 42 };
        else if (paths[index] === 'settings.config' && entry?.result?.data) entry.result.data.hasBackup = false;
    return route.fulfill({ response, json: body });
  });
});

const pages = [
  { path: '/desk/settings/pomodoro', ready: 'Durata del focus', file: 'desk-settings-module-4k.png' },
  // Audio's outputs are a list of flat objects: the rows editor, shown here empty with its Aggiungi button.
  { path: '/desk/settings/audio', ready: 'Uscite audio', file: 'desk-settings-rows-4k.png' },
  { path: '/desk/settings/appearance', ready: 'Vale per questo schermo', file: 'desk-settings-appearance-4k.png' },
  // The core config page: MCP and job limits, never `server`.
  { path: '/desk/settings/core', ready: 'Job simultanei', file: 'desk-settings-core-4k.png' },
] as const;

for (const { path, ready, file } of pages) {
  test(`${path} at 4K matches the baseline`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByText(ready).first()).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(file.replace('.png', `${suffix}.png`), { animations: 'disabled' });
  });
}
