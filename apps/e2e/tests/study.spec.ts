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
  await expect(page.getByRole('heading', { name: 'Piano di esempio', level: 2 })).toBeVisible();
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

test('a second plan is active next to the first, filters by plan and pauses from Piani', async ({ page }) => {
  const inbox = join(RUN_TMP, 'study', 'in-arrivo');
  await mkdir(inbox, { recursive: true });
  const base = JSON.parse(
    await readFile(new URL('../../server/src/modules/study/fixtures/example.json', import.meta.url), 'utf8'),
  );
  await copyFile(
    new URL('../../server/src/modules/study/fixtures/example.json', import.meta.url),
    join(inbox, 'first.json'),
  );
  // One subject, the same day ids as the first plan: days are told apart by plan (decision 15).
  const second = {
    ...base,
    id: 'second',
    title: 'Secondo corso',
    subjects: [{ id: 'a', name: 'Geologia' }],
    threads: [{ id: 'plants', subject: 'a', title: 'Rocce' }],
    phases: [],
    days: base.days.map((day: { id: string }) => ({
      ...day,
      subject: 'a',
      phase: undefined,
      threads: ['plants'],
      title: `Rocce ${day.id}`,
    })),
  };
  await writeFile(join(inbox, 'second.json'), JSON.stringify(second));
  const db = new DatabaseSync(join(RUN_TMP, 'modules', 'study.db'));
  try {
    await page.goto(`${PC_URL}/desk/studio?tab=piani`);
    for (const name of ['Piano di esempio', 'Secondo corso']) {
      const found = page.getByRole('region', { name: 'Nuovo piano trovato' }).filter({ hasText: name });
      await found.getByRole('button', { name: 'Attiva' }).click();
      await expect(found).not.toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Piano di esempio' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Secondo corso' })).toBeVisible();
    await page.getByRole('tab', { name: 'Piano', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Piano · 2 piani' })).toBeVisible();
    const subjects = page.getByRole('group', { name: 'Materie' });
    await subjects.getByRole('button', { name: 'Secondo corso' }).click();
    await expect(page.getByRole('button', { name: /· Rocce A01$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /· La foglia$/ })).not.toBeVisible();
    await page.getByRole('tab', { name: 'Piani', exact: true }).click();
    await page
      .getByRole('region', { name: 'Secondo corso' })
      .getByRole('button', { name: 'Metti in pausa il piano' })
      .click();
    const pausedPlans = page.getByRole('region', { name: 'Piani in pausa' });
    await expect(pausedPlans.getByText('Secondo corso')).toBeVisible();
    await pausedPlans.getByRole('button', { name: 'Riprendi' }).click();
    await expect(page.getByRole('heading', { name: 'Secondo corso' })).toBeVisible();
  } finally {
    for (const table of ['plans', 'progress', 'preferences'])
      db.prepare(`DELETE FROM ${table} WHERE ${table === 'plans' ? 'id' : 'plan_id'} IN ('second', '*')`).run();
    db.prepare("DELETE FROM days WHERE plan_id = 'second'").run();
    db.close();
  }
});

test('Oggi tracks steps, notes, autonomy and a chosen day without completing earlier work', async ({ page, pc }) => {
  const inbox = join(RUN_TMP, 'study', 'in-arrivo');
  await mkdir(inbox, { recursive: true });
  await copyFile(
    new URL('../../server/src/modules/study/fixtures/example.json', import.meta.url),
    join(inbox, 'today.json'),
  );
  expect((await pc.post('/trpc/study.activate', { data: { name: 'today.json' } })).ok()).toBe(true);
  await page.goto(`${PC_URL}/desk/studio?tab=piano`);
  await page.getByRole('button', { name: 'G2 · Il cielo' }).click();
  await page.getByRole('button', { name: 'Imposta come corrente' }).last().click();
  await page.getByRole('tab', { name: 'Studio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Il cielo' })).toBeVisible();
  await page.getByRole('button', { name: 'Stelle: Da valutare' }).click();
  await page.getByRole('option', { name: 'Verde' }).click();
  const tick = page.getByRole('checkbox', { name: 'Descrivi una stella.' });
  await tick.check();
  await expect(tick).toBeChecked();
  await expect(page.getByRole('button', { name: 'Stelle: Verde' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Note' }).fill('Nota di esempio');
  await page.getByRole('textbox', { name: 'Note' }).blur();
  await expect(page.getByText('Salvato')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'La foglia' })).toBeVisible();
  await page.getByRole('tab', { name: 'Piano', exact: true }).click();
  await expect(page.getByRole('button', { name: 'G1 · La foglia' })).toBeVisible();
  await page.getByRole('button', { name: 'Da finire' }).click();
  await expect(page.getByRole('button', { name: 'G2 · Il cielo' })).not.toBeVisible();
});

test('Oggi preserves a failed tick until retry and passed subjects can be resumed', async ({ page, pc }) => {
  const db = new DatabaseSync(join(RUN_TMP, 'modules', 'study.db'));
  db.prepare("DELETE FROM progress WHERE plan_id IN ('example', '*')").run();
  db.close();
  const inbox = join(RUN_TMP, 'study', 'in-arrivo');
  await mkdir(inbox, { recursive: true });
  await copyFile(
    new URL('../../server/src/modules/study/fixtures/example.json', import.meta.url),
    join(inbox, 'retry.json'),
  );
  expect((await pc.post('/trpc/study.activate', { data: { name: 'retry.json' } })).ok()).toBe(true);
  await page.goto(`${PC_URL}/desk/studio`);
  await expect(page.getByRole('heading', { name: 'La foglia' })).toBeVisible();
  await page.route('**/trpc/study.setStep*', async (route) => {
    await route.abort();
  });
  const tick = page.getByRole('checkbox', { name: 'Descrivi una foglia.' });
  await tick.check();
  await expect(page.getByRole('alert')).toContainText('Salvataggio non riuscito');
  await expect(tick).toBeChecked();
  await page.unroute('**/trpc/study.setStep*');
  await page.getByRole('button', { name: 'Riprova' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stato materia: In corso' }).click();
  await page.getByRole('option', { name: 'Superato' }).click();
  await expect(page.getByRole('heading', { name: 'Il cielo' })).toBeVisible();
  await page.getByRole('tab', { name: 'Piani', exact: true }).click();
  await page.getByRole('button', { name: 'Riprendi' }).click();
  await expect(page.getByRole('button', { name: 'Segna superato' }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Piano', exact: true }).click();
  await page.getByRole('button', { name: /^Settimana 2 ·/ }).click();
  await expect(page.getByRole('button', { name: /La radice$/ })).toBeVisible();
});

test('Oggi keeps a failed note through navigation and saves it on retry', async ({ page }) => {
  const db = new DatabaseSync(join(RUN_TMP, 'modules', 'study.db'));
  db.prepare("DELETE FROM progress WHERE plan_id IN ('example', '*')").run();
  db.close();
  await page.goto(`${PC_URL}/desk/studio`);
  await expect(page.getByRole('heading', { name: 'La foglia' })).toBeVisible();
  await page.route('**/trpc/study.setNote*', (route) => route.abort());
  await page.getByRole('textbox', { name: 'Note' }).fill('Nota conservata');
  await page.getByRole('textbox', { name: 'Note' }).blur();
  await expect(page.getByRole('alert')).toContainText('Salvataggio non riuscito');
  await page.getByRole('tab', { name: 'Piano', exact: true }).click();
  await page.getByRole('tab', { name: 'Studio', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue('Nota conservata');
  await page.unroute('**/trpc/study.setNote*');
  await page.getByRole('button', { name: 'Riprova' }).click();
  await expect(page.getByText('Salvato')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue('Nota conservata');
});

test('pausing a subject renumbers Oggi and Piano and completing today offers the next day', async ({ page }) => {
  const db = new DatabaseSync(join(RUN_TMP, 'modules', 'study.db'));
  db.prepare("DELETE FROM progress WHERE plan_id IN ('example', '*')").run();
  db.prepare("DELETE FROM preferences WHERE plan_id = '*'").run();
  db.close();
  await page.goto(`${PC_URL}/desk/studio`);
  await expect(page.getByRole('heading', { name: 'La foglia' })).toBeVisible();
  await page.getByRole('tab', { name: 'Piani', exact: true }).click();
  const astronomy = page.getByRole('listitem').filter({ hasText: 'Astronomia' });
  await astronomy.getByRole('button', { name: 'Metti in pausa' }).click();
  await page.getByRole('tab', { name: 'Studio', exact: true }).click();
  await expect(page.getByText('G2 · La radice')).toBeVisible();
  await page.getByRole('tab', { name: 'Piano', exact: true }).click();
  await page.getByRole('button', { name: /^Settimana 2 ·/ }).click();
  await expect(page.getByRole('button', { name: 'G2 · La radice' })).toBeVisible();
  await page.getByRole('tab', { name: 'Studio', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Descrivi una foglia.' }).check();
  await page.getByRole('button', { name: 'Vai alla prossima G' }).click();
  await expect(page.getByRole('heading', { name: 'La radice' })).toBeVisible();
  await expect(page.getByText(/in ritardo|giorni trascorsi/i)).toHaveCount(0);
});

test('mix reorders next days while weekly hours update estimates and preserve today', async ({ page, pc }) => {
  const inbox = join(RUN_TMP, 'study', 'in-arrivo');
  const plan = JSON.parse(
    await readFile(new URL('../../server/src/modules/study/fixtures/example.json', import.meta.url), 'utf8'),
  );
  plan.days.push(
    ...['B02', 'B03'].map((id) => ({
      ...plan.days[1],
      id,
      title: `Stelle ${id}`,
      blocks: [{ id: `${id}.m`, title: 'Studio', steps: [{ id: `${id}.s`, text: 'Studia le stelle' }] }],
    })),
  );
  await writeFile(join(inbox, 'mix.json'), JSON.stringify(plan));
  const db = new DatabaseSync(join(RUN_TMP, 'modules', 'study.db'));
  db.prepare("DELETE FROM progress WHERE plan_id IN ('example', '*')").run();
  db.prepare("DELETE FROM preferences WHERE plan_id = '*'").run();
  db.close();
  expect((await pc.post('/trpc/study.activate', { data: { name: 'mix.json' } })).ok()).toBe(true);
  await page.goto(`${PC_URL}/desk/studio`);
  await expect(page.getByText('G3 · La radice')).toBeVisible();
  await page.goto(`${PC_URL}/desk/studio?tab=piani`);
  await page.getByRole('spinbutton', { name: 'Ore a settimana' }).fill('4');
  await page.getByRole('spinbutton', { name: 'Botanica · Quota %' }).fill('20');
  await page.getByRole('spinbutton', { name: 'Astronomia · Quota %' }).fill('80');
  await page.getByRole('button', { name: 'Salva', exact: true }).click();
  await expect(page.getByText('80% · 3,2 ore a settimana')).toBeVisible();
  await page.getByRole('tab', { name: 'Studio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'La foglia' })).toBeVisible();
  await expect(page.getByText('G3 · Stelle B02')).toBeVisible();
  await page.getByRole('tab', { name: 'Piani', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Ore a settimana' }).fill('8');
  await page.getByRole('button', { name: 'Salva', exact: true }).click();
  await expect(page.getByText('80% · 6,4 ore a settimana')).toBeVisible();
  await page.getByRole('tab', { name: 'Studio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'La foglia' })).toBeVisible();
  await expect(page.getByText('G3 · Stelle B02')).toBeVisible();
});
