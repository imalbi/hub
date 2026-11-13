import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from './fixtures.ts';
import { PC_URL, RUN_TMP } from './hosts.ts';

test('activates a plan and opens its days in place', async ({ page }) => {
  const inbox = join(RUN_TMP, 'study', 'in-arrivo');
  await mkdir(inbox, { recursive: true });
  await page.goto(`${PC_URL}/desk/studio?tab=piani`);
  await expect(page.getByText('Nuovo piano trovato')).not.toBeVisible();
  await copyFile(
    new URL('../../server/src/modules/study/fixtures/example.json', import.meta.url),
    join(inbox, 'example.json'),
  );
  await expect(page.getByText('Nuovo piano trovato')).toBeVisible();
  await page.getByRole('button', { name: 'Attiva' }).click();
  await expect(page.getByText('Piano di esempio')).toBeVisible();
  const hours = page.getByRole('spinbutton', { name: 'Ore a settimana' });
  expect((await hours.boundingBox())?.width).toBeGreaterThan(200);
  await page.getByRole('tab', { name: 'Piano', exact: true }).click();
  const leaf = page.getByRole('button', { name: 'G1 · La foglia' });
  await expect(leaf).toBeVisible();
  // The group holding the current day starts open, the others closed; the current day starts open in place.
  await expect(page.getByRole('button', { name: /^Settimana 1 ·/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: /^Settimana 2 ·/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(leaf).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Descrivi una foglia.')).toBeVisible();
  await leaf.click();
  await expect(page.getByText('Descrivi una foglia.')).not.toBeVisible();
  await page.getByRole('button', { name: 'G2 · Il cielo' }).click();
  await expect(page.getByText('Descrivi una stella.')).toBeVisible();
  // Read-only: no control to tick a step in Piano (ticking is step 41, in Oggi).
  await expect(page.getByRole('region', { name: 'Giorni del piano' }).getByRole('checkbox')).toHaveCount(0);
  const unfinished = page.getByRole('button', { name: 'Da finire' });
  await expect(unfinished).toHaveAttribute('aria-pressed', 'false');
  await unfinished.click();
  await expect(leaf).toBeVisible();
  const subjects = page.getByRole('group', { name: 'Materie' });
  await subjects.getByRole('button', { name: 'Astronomia' }).click();
  await expect(leaf).not.toBeVisible();
  await subjects.getByRole('button', { name: 'Tutte' }).click();
  await expect(page.getByRole('button', { name: 'G2 · Il cielo' })).toBeVisible();
  await page.getByRole('button', { name: /^Settimana 2 ·/ }).click();
  await expect(page.getByRole('button', { name: 'G3 · La radice' })).toBeVisible();
  const db = new DatabaseSync(join(RUN_TMP, 'modules', 'study.db'));
  try {
    db.prepare('INSERT INTO progress (plan_id, kind, id, value) VALUES (?, ?, ?, ?)').run(
      'example',
      'day',
      'A01',
      'done',
    );
    await page.reload();
    await expect(page.getByRole('button', { name: 'G1 · La foglia' })).toBeVisible();
    await page.getByRole('button', { name: 'Da finire' }).click();
    await expect(page.getByRole('button', { name: 'G1 · La foglia' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'G2 · Il cielo' })).toBeVisible();
  } finally {
    db.prepare('DELETE FROM progress WHERE plan_id = ? AND kind = ? AND id = ?').run('example', 'day', 'A01');
    db.close();
  }
});

test('a large plan loads only the first open group', async ({ page, pc }) => {
  const inbox = join(RUN_TMP, 'study', 'in-arrivo');
  await mkdir(inbox, { recursive: true });
  const plan = JSON.parse(
    await readFile(new URL('../../server/src/modules/study/fixtures/example.json', import.meta.url), 'utf8'),
  );
  plan.days = Array.from({ length: 500 }, (_, i) => ({
    ...plan.days[0],
    id: `day-${i}`,
    recall: [],
    blocks: [
      {
        id: `block-${i}`,
        title: 'Studio',
        steps: Array.from({ length: 10 }, (_, n) => ({ id: `step-${i}-${n}`, text: 'Studia' })),
      },
    ],
  }));
  await writeFile(join(inbox, 'large.json'), JSON.stringify(plan));
  expect((await pc.post('/trpc/study.activate', { data: { name: 'large.json' } })).ok()).toBe(true);
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('study.daysById')) calls.push(request.url());
  });
  await page.goto(`${PC_URL}/desk/studio?tab=piano`);
  await expect(page.getByRole('button', { name: 'G1 · La foglia' })).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(decodeURIComponent(calls[0] ?? '')).toContain('day-6');
  expect(decodeURIComponent(calls[0] ?? '')).not.toContain('day-7');
  await expect(page.getByRole('button', { name: /^Settimana 2 ·/ })).toHaveAttribute('aria-expanded', 'false');
});
