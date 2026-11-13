import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from './fixtures.ts';
import { PC_URL, RUN_TMP } from './hosts.ts';
import { freezePomodoro } from './pomodoro-visual.ts';
import { chooseTheme } from './themes.ts';

test.beforeAll(async ({ request }) => {
  const db = new DatabaseSync(join(RUN_TMP, 'modules', 'study.db'));
  db.prepare("DELETE FROM progress WHERE plan_id IN ('example', '*')").run();
  db.prepare("DELETE FROM preferences WHERE plan_id = '*'").run();
  db.close();
  const inbox = join(RUN_TMP, 'study', 'in-arrivo');
  await mkdir(inbox, { recursive: true });
  await copyFile(
    new URL('../../server/src/modules/study/fixtures/example.json', import.meta.url),
    join(inbox, 'visual.json'),
  );
  expect((await request.post(`${PC_URL}/trpc/study.activate`, { data: { name: 'visual.json' } })).ok()).toBe(true);
});

for (const theme of [
  { name: 'Scuro', id: 'ink' },
  { name: 'Chiaro', id: 'paper' },
]) {
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 3840, height: 2160 },
  ]) {
    for (const tab of [
      { name: 'Oggi', id: 'studio' },
      { name: 'Piano', id: 'piano' },
      { name: 'Piani', id: 'piani' },
    ]) {
      test(`${tab.name} ${size.width} ${theme.id}`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await freezePomodoro(page);
        await page.goto('/desk/settings/appearance');
        await chooseTheme(page, theme.name);
        await page.goto(`/desk/studio?tab=${tab.id}`);
        if (tab.id === 'studio') {
          await expect(page.getByRole('heading', { name: 'La foglia' })).toBeVisible();
          await expect(page.getByText('Sessioni completate oggi: 0')).toBeVisible();
        } else await expect(page.getByText('Piano di esempio').first()).toBeVisible();
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot(`study-${tab.id}-${size.width}-${theme.id}.png`, {
          animations: 'disabled',
        });
        await page.goto('/desk/settings/appearance');
        await chooseTheme(page, 'Scuro');
      });
    }
  }
}
