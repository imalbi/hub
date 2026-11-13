import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from './fixtures.ts';
import { RUN_TMP } from './hosts.ts';

test('library searches, filters, opens and downloads material', async ({ page }) => {
  await page.goto('/desk/studio?tab=libreria');
  await expect(page.getByText('dispensa.pdf', { exact: false })).toBeVisible();
  await page.getByRole('textbox', { name: 'Cerca materiale' }).fill('mancante');
  await expect(page.getByText('dispensa.pdf', { exact: false })).not.toBeVisible();
  await page.getByRole('textbox', { name: 'Cerca materiale' }).fill('dispensa');
  await page.getByRole('button', { name: 'Cartella: Tutte' }).click();
  await page.getByRole('option', { name: 'materiali' }).click();
  const response = page.waitForResponse((item) => item.url().includes('/files/') && item.url().includes('inline=1'));
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Apri', exact: true }).click();
  const tab = await popup;
  const opened = await tab.waitForEvent('download');
  expect(opened.url()).toMatch(/^blob:/);
  expect((await response).headers()['content-disposition']).toMatch(/^inline;/);
  await tab.close();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Scarica' }).click();
  expect((await download).suggestedFilename()).toBe('dispensa.pdf');
});

test('today links a PDF page and starts focus for its day', async ({ page, pc }) => {
  const inbox = join(RUN_TMP, 'study', 'in-arrivo');
  await mkdir(inbox, { recursive: true });
  const plan = JSON.parse(
    await readFile(new URL('../../server/src/modules/study/fixtures/example.json', import.meta.url), 'utf8'),
  );
  plan.days[0].blocks[0].steps[0].file = { path: 'dispensa.pdf', page: 3 };
  await writeFile(join(inbox, 'material-test.json'), JSON.stringify(plan));
  expect((await pc.post('/trpc/study.activate', { data: { name: 'material-test.json' } })).ok()).toBe(true);
  await page.goto('/desk/studio');
  const step = page.getByText('Descrivi una foglia.').locator('..');
  const popup = page.waitForEvent('popup');
  await step.getByRole('button', { name: 'Apri' }).click();
  const tab = await popup;
  const opened = await tab.waitForEvent('download');
  expect(opened.url()).toMatch(/#page=3$/);
  await tab.close();
  await page.getByRole('button', { name: 'Avvia Pomodoro' }).click();
  await expect(page.getByText('Studio: 0,1 min')).toBeVisible({ timeout: 15000 });
  const db = new DatabaseSync(join(RUN_TMP, 'hub-e2e.db'));
  try {
    db.prepare('DELETE FROM pomodoro_sessions WHERE tag = ?').run('study/example/A01');
  } finally {
    db.close();
  }
});
