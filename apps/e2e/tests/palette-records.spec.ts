import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { RUN_TMP } from './hosts.ts';

// Step 64: record groups in the palette. The mail fixture is the fake himalaya's (subjects "Offerta di colloquio" and
// "Re: Domanda sul ruolo" both hold "ol"); a source with more matches than rows is a canned answer.
const palette = (page: Page) => page.getByRole('dialog', { name: 'Comandi' });

async function openPalette(page: Page) {
  await page.goto('/desk');
  await page.getByRole('button', { name: 'Cerca o esegui, scorciatoia Ctrl K' }).click();
  await expect(palette(page).getByRole('combobox')).toBeFocused();
  await expect(palette(page).getByRole('option', { name: /Avvia Pomodoro/ })).toBeVisible();
}

const answer = (data: unknown) => ({ json: [{ result: { data } }] });
const fail = {
  status: 500,
  json: [{ error: { message: 'boom', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR' } } }],
};
const mailRow = (id: string, subject: string) => ({
  id,
  account: 'work',
  label: 'Lavoro',
  messageId: null,
  subject,
  from: { name: 'Carla', email: 'carla@example.org' },
  date: '2026-11-07T09:00:00Z',
  seen: true,
  flagged: false,
  hasAttachment: null,
});
const studyRow = (key: string, title: string) => ({ key, g: 1, title, subject: 'p:a', done: false });
const headers = [{ id: 'p', title: 'Corso', subjects: [{ id: 'a', name: 'Chimica' }] }];

test('Posta shows at most 3 messages with sender and account, and no request is made for one character', async ({
  page,
}) => {
  const asked: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('mail.searchRecords')) asked.push(request.url());
  });
  await openPalette(page);
  const field = palette(page).getByRole('combobox');
  await field.fill('o');
  await page.waitForTimeout(500);
  expect(asked).toEqual([]);
  await field.fill('ol');
  const posta = palette(page).getByRole('group', { name: /Posta/ });
  await expect(posta.getByRole('option')).toHaveCount(2);
  expect(asked).toHaveLength(1);
  await expect(posta.getByRole('option', { name: /Offerta di colloquio/ })).toContainText('Lavoro');
  await expect(posta.getByRole('option', { name: /Offerta di colloquio/ })).toContainText('Recruiter Example');
  await expect(posta.getByRole('option', { name: /Domanda sul ruolo/ })).toBeVisible();
});

test('a source with 5 matches shows 3 rows, the count 5 and a link to the whole search', async ({ page }) => {
  await page.route('**/trpc/mail.searchRecords*', (route) =>
    route.fulfill(
      answer({
        total: 5,
        rows: [mailRow('1', 'Uno'), mailRow('2', 'Due'), mailRow('3', 'Tre'), mailRow('4', 'Quattro')],
      }),
    ),
  );
  await openPalette(page);
  await palette(page).getByRole('combobox').fill('uno');
  const posta = palette(page).getByRole('group', { name: /Posta/ });
  await expect(posta.getByRole('option')).toHaveCount(3);
  await expect(posta).toContainText('5');
  await posta.getByRole('button', { name: 'Vedi tutti in Messaggi' }).click();
  await expect(page).toHaveURL(/\/desk\/messaggi\?tab=mail&subject=uno$/);
  await expect(palette(page)).not.toBeVisible();
  await expect(page.getByRole('region', { name: 'Posta in arrivo' })).toBeVisible();
});

test('records that arrive into an empty list leave it at the top, the first heading in view', async ({ page }) => {
  // With no row the list is 0 high; the keep-in-view effect then scrolled the first record "into view" by its own
  // height, and the first heading stayed hidden once the panel grew (seen on real data at 4K, step 64 review).
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.route('**/trpc/mail.searchRecords*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill(
      answer({ total: 3, rows: [mailRow('1', 'Qzx uno'), mailRow('2', 'Qzx due'), mailRow('3', 'Qzx tre')] }),
    );
  });
  await openPalette(page);
  // No action and no other source matches "qzx": the list is empty until Posta answers.
  await palette(page).getByRole('combobox').fill('qzx');
  await expect(palette(page).getByRole('group', { name: /Posta/ }).getByRole('option')).toHaveCount(3);
  await page.waitForTimeout(600);
  const scrollTop = await palette(page)
    .getByRole('listbox')
    .evaluate((list) => list.closest('.overflow-y-auto')?.scrollTop);
  expect(scrollTop).toBe(0);
});

test('Enter on a record row opens its page with the message selected and closes the palette', async ({ page }) => {
  await openPalette(page);
  await palette(page).getByRole('combobox').fill('ol');
  await expect(palette(page).getByRole('group', { name: /Posta/ }).getByRole('option')).toHaveCount(2);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/desk\/messaggi\?tab=mail&subject=Offerta\+di\+colloquio&message=work%3A310$/);
  await expect(palette(page)).not.toBeVisible();
  await expect(page.getByRole('region', { name: 'Offerta di colloquio' })).toBeVisible();
});

test('record groups come before Vai a and Azioni, in module order', async ({ page }) => {
  await page.route('**/trpc/study.searchRecords*', (route) =>
    route.fulfill(answer({ total: 1, rows: [studyRow('p/D1', 'Studio dei metalli')], headers })),
  );
  await page.route('**/trpc/mail.searchRecords*', (route) =>
    route.fulfill(answer({ total: 1, rows: [mailRow('1', 'Studio del lunedì')] })),
  );
  await openPalette(page);
  await palette(page).getByRole('combobox').fill('stud');
  await expect(palette(page).getByRole('option', { name: /Studio dei metalli/ })).toBeVisible();
  await expect(palette(page).getByRole('option', { name: /Studio del lunedì/ })).toBeVisible();
  await expect
    .poll(() =>
      palette(page)
        .getByRole('group')
        .evaluateAll((groups) => groups.map((g) => g.getAttribute('aria-label'))),
    )
    .toEqual(['Studio', 'Posta', 'Vai a', 'Azioni']);
  // A query with no matching action keeps the Azioni heading and says so.
  await palette(page).getByRole('combobox').fill('studio dei metalli');
  await expect(palette(page).getByRole('group', { name: 'Azioni' })).toContainText('nessuna per “studio dei metalli”');
});

test('a source that fails leaves the other groups and the actions, with no error row', async ({ page }) => {
  await page.route('**/trpc/study.searchRecords*', (route) => route.fulfill(fail));
  await openPalette(page);
  await palette(page).getByRole('combobox').fill('ol');
  const posta = palette(page).getByRole('group', { name: /Posta/ });
  await expect(posta.getByRole('option')).toHaveCount(2);
  await expect(palette(page).getByRole('group', { name: 'Azioni' }).getByRole('option').first()).toBeVisible();
  await expect(palette(page).getByRole('group', { name: /Studio/ })).toHaveCount(0);
  // The server message and the palette's own failure line; not a bare "errore", which the action «Errore di studio» carries.
  await expect(palette(page)).not.toContainText(/boom|non riuscita/i);
});

test('a day title found in Studio shows under Studio with its subject', async ({ page, pc }) => {
  const db = new DatabaseSync(join(RUN_TMP, 'modules', 'study.db'));
  db.prepare("DELETE FROM progress WHERE plan_id IN ('example', '*')").run();
  db.prepare("DELETE FROM preferences WHERE plan_id = '*'").run();
  db.close();
  const inbox = join(RUN_TMP, 'study', 'in-arrivo');
  await mkdir(inbox, { recursive: true });
  await copyFile(
    new URL('../../server/src/modules/study/fixtures/example.json', import.meta.url),
    join(inbox, 'example.json'),
  );
  expect((await pc.post('/trpc/study.activate', { data: { name: 'example.json' } })).ok()).toBe(true);
  try {
    await openPalette(page);
    await palette(page).getByRole('combobox').fill('FOGLIA');
    const studio = palette(page).getByRole('group', { name: /Studio/ });
    await expect(studio.getByRole('option')).toHaveCount(1);
    await expect(studio.getByRole('option', { name: /G1 · La foglia/ })).toContainText('Botanica');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/desk\/studio\?tab=piano$/);
    await expect(palette(page)).not.toBeVisible();
  } finally {
    // Back to a desk with no active plan: other specs read the Studio page as it is without one.
    await pc.post('/trpc/study.setPlan', { data: { id: 'example', active: false } });
  }
});
