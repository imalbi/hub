import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { RUN_TMP } from './hosts.ts';
import { legiblePlan } from './study-fixtures.ts';

async function openToday(page: Page, pc: APIRequestContext) {
  const db = new DatabaseSync(join(RUN_TMP, 'modules', 'study.db'));
  db.prepare("DELETE FROM progress WHERE plan_id IN ('example', '*')").run();
  db.prepare("DELETE FROM preferences WHERE plan_id = '*'").run();
  db.close();
  const inbox = join(RUN_TMP, 'study', 'in-arrivo');
  await mkdir(inbox, { recursive: true });
  await writeFile(join(inbox, 'legible.json'), JSON.stringify(await legiblePlan()));
  expect((await pc.post('/trpc/study.activate', { data: { name: 'legible.json' } })).ok()).toBe(true);
  await page.goto('/desk/studio');
  await expect(page.getByRole('heading', { name: 'La foglia', level: 2 })).toBeVisible();
}

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error('Element has no box');
  return found;
}
const intersects = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('Oggi lists the files to open, day materials first, each file once, and a pill opens its page', async ({
  page,
  pc,
}) => {
  await openToday(page, pc);
  const files = page.getByRole('group', { name: 'Da aprire' });
  await expect
    .poll(() => files.getByRole('button').evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))))
    .toEqual([
      'Dispensa',
      'Errata Verificati',
      'Capitolo 03 - La struttura delle foglie e dei tessuti',
      '2_Anatomia_vegetale_DV',
    ]);
  // The material's page wins over the step's page 3 for the same file.
  const popup = page.waitForEvent('popup');
  await files.getByRole('button', { name: 'Dispensa' }).click();
  const tab = await popup;
  const opened = await tab.waitForEvent('download');
  expect(opened.url()).toMatch(/#page=5$/);
  await tab.close();
});

test('Oggi stacks the blocks and shows a compact link per step instead of the path', async ({ page, pc }) => {
  await openToday(page, pc);
  const headings = await Promise.all(
    ['Mattino', 'Pomeriggio', 'Chiusura'].map((name) => box(page.getByRole('heading', { name, level: 4 }))),
  );
  for (const [i, heading] of headings.slice(1).entries()) {
    expect(heading.y).toBeGreaterThan((headings[i]?.y ?? 0) + 40);
    expect(Math.abs(heading.x - (headings[0]?.x ?? 0))).toBeLessThan(2);
  }
  const link = page.getByRole('button', { name: /^Apri p\. 34, Capitolo 03 - La struttura/ });
  await expect(link).toBeVisible();
  await expect(link).toContainText('Apri p. 34');
  await expect(page.getByRole('button', { name: /^Apri, 2_Anatomia_vegetale_DV\.pdf/ })).toContainText('Apri');
  await expect(page.getByRole('button', { name: /^Apri p\. 18, 2_Anatomia/ })).toContainText('Apri p. 18');
  await expect(page.getByText('Slide Ufficiali Prof')).toHaveCount(0);
  await expect(page.getByText(/Pagina \d+/)).toHaveCount(0);
  await expect(page.getByText('40 min', { exact: true })).toBeVisible();
});

test('Oggi header, counters and the next days read cleanly without phases', async ({ page, pc }) => {
  await openToday(page, pc);
  await expect(page.getByText('G1 · Botanica', { exact: true })).toBeVisible();
  const count = page.getByRole('paragraph').filter({ hasText: 'di 6 passi' });
  await expect(count).toMatchAriaSnapshot('- paragraph: 0 di 6 passi');
  await page.getByRole('checkbox', { name: 'Scrivi tre righe di sintesi.' }).check();
  await expect(count).toMatchAriaSnapshot('- paragraph: 1 di 6 passi');
  await expect(page.getByText(/di 3 G completate/)).toHaveCount(1);
});

test('the step error button shows a tooltip on hover and on focus', async ({ page, pc }) => {
  await openToday(page, pc);
  const buttons = page.getByRole('button', { name: /^Registra un errore su: / });
  await expect(buttons).toHaveCount(6);
  const first = buttons.first();
  await first.hover();
  await expect(page.getByRole('tooltip')).toHaveText('Registra un errore');
  await page.mouse.move(0, 0);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  // Keyboard focus shows it too: the step without a file has the checkbox right before the button.
  await page.getByRole('checkbox', { name: 'Rivedi gli errori della giornata.' }).focus();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Registra un errore su: Rivedi gli errori della giornata.' }),
  ).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveText('Registra un errore');
});

test('no step error button covers text or another button', async ({ page, pc }) => {
  await openToday(page, pc);
  const buttons = page.getByRole('button', { name: /^Registra un errore su: / });
  await expect(buttons).toHaveCount(6);
  // No error button intersects any step text or another step's button (the glyph used to land on a neighbour's text).
  const texts = await Promise.all(
    [
      'Leggi il capitolo sui tessuti e annota i termini nuovi.',
      'Rileggi gli esempi come riscontro.',
      'Svolgi gli esercizi da 1 a 11.',
      'Confronta con le soluzioni.',
      'Rivedi gli errori della giornata.',
      'Scrivi tre righe di sintesi.',
    ].map((text) => box(page.getByText(text))),
  );
  const marks = await Promise.all((await buttons.all()).map((button) => box(button)));
  for (const mark of marks) for (const text of texts) expect(intersects(mark, text)).toBe(false);
  for (const [i, a] of marks.entries()) for (const b of marks.slice(i + 1)) expect(intersects(a, b)).toBe(false);
});
