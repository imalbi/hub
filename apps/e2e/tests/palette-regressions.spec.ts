import { expect, test } from './fixtures.ts';
import { restoreDesktop } from './desktop.ts';

test('opening a generated form moves keyboard focus to its first control', async ({ page }) => {
  await page.goto('/desk');
  await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await palette.getByRole('combobox').fill('Seleziona uscita audio');
  await expect(palette.getByRole('option', { name: /Seleziona uscita audio/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(palette.getByRole('textbox', { name: 'label', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(palette).not.toBeVisible();
  await page.keyboard.press('Control+k');
  await palette.getByRole('combobox').fill('Spegni PC');
  await expect(palette.getByRole('option', { name: /Spegni PC/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(palette.getByRole('button', { name: 'Tieni premuto per Spegni PC' })).toBeFocused();
});

// Step 20 review: Enter on an item before the grow had ended opened its page, then the end of the grow gave focus back
// to the field, so the hold had no focus about half the runs. The frozen clock is what the visual specs use.
test('a page opened before the palette finished growing keeps its focus', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
  await page.goto('/desk/studio');
  await expect(page.getByRole('button', { name: 'Avvia', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await expect(palette.getByRole('option', { name: /Avvia Pomodoro/ })).toBeVisible();
  await palette.getByRole('combobox').fill('Spegni PC');
  await page.keyboard.press('Enter');
  const hold = palette.getByRole('button', { name: 'Tieni premuto per Spegni PC' });
  await expect(hold).toBeVisible();
  await page.waitForTimeout(800);
  await expect(hold).toBeFocused();
});

test('completion from a closed session cannot dismiss a newly opened form', async ({ page, pc }) => {
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/trpc/media.next*', async (route) => {
    await held;
    await route.continue();
  });
  try {
    await page.goto('/desk');
    await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toBeVisible();
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Comandi' });
    await palette.getByRole('combobox').fill('Traccia successiva');
    await expect(palette.getByRole('option', { name: /Traccia successiva/ })).toBeVisible();
    const requested = page.waitForRequest((request) => request.url().includes('media.next'));
    await page.keyboard.press('Enter');
    await requested;
    await page.keyboard.press('Escape');
    await expect(palette).not.toBeVisible();
    await page.keyboard.press('Control+k');
    await palette.getByRole('combobox').fill('Seleziona uscita audio');
    await expect(palette.getByRole('option', { name: /Seleziona uscita audio/ })).toBeVisible();
    await page.keyboard.press('Enter');
    const field = palette.getByRole('textbox', { name: 'label', exact: true });
    await field.fill('Casse');
    const completed = page.waitForResponse((response) => response.url().includes('media.next'));
    release?.();
    await completed;
    await expect.poll(() => page.evaluate(() => localStorage.getItem('hub.palette.recent'))).toContain('media.next');
    await expect(field).toHaveValue('Casse');
    await expect(palette).toBeVisible();
  } finally {
    release?.();
    await page.unrouteAll({ behavior: 'wait' });
    await restoreDesktop(pc);
  }
});

test('a palette layout reset refreshes the board without a reload', async ({ page, pc }) => {
  await pc.post('/trpc/layout.save', { data: { zone: 'overview', items: [] } });
  try {
    await page.goto('/desk');
    await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toBeVisible();
    await expect(page.locator('[data-widget]')).toHaveCount(0);
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Comandi' });
    await palette.getByRole('combobox').fill('Ripristina disposizione widget');
    await expect(palette.getByRole('option', { name: /Ripristina disposizione widget/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await palette.getByRole('textbox', { name: 'zone', exact: true }).fill('overview');
    await palette.getByRole('button', { name: 'Esegui', exact: true }).click();
    await expect(palette.getByRole('status')).toHaveText('Fatto');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-widget="pomodoro"]')).toBeVisible();
  } finally {
    await pc.post('/trpc/layout.reset', { data: { zone: 'overview' } });
  }
});

// Step 64, P4: an answer for an older query must never replace a newer one. The first query's answer is held for a
// second (and its request aborted when the key changes); the list may only ever show the second query's rows.
test('a slow answer for an older query never replaces the newer one', async ({ page }) => {
  const queryOf = (url: string) => {
    const input: unknown = JSON.parse(new URL(url).searchParams.get('input') ?? '{}');
    return typeof input === 'object' && input !== null && '0' in input ? JSON.stringify(input['0']) : '';
  };
  const day = (key: string, title: string) => ({
    total: 1,
    rows: [{ key, g: 1, title, subject: 'p:a', done: false }],
    headers: [{ id: 'p', title: 'Corso', subjects: [{ id: 'a', name: 'Chimica' }] }],
  });
  await page.route('**/trpc/study.searchRecords*', async (route) => {
    const slow = queryOf(route.request().url()) === '{"query":"re"}';
    if (slow) await new Promise((resolve) => setTimeout(resolve, 1000));
    await route
      .fulfill({
        json: [{ result: { data: slow ? day('p/D1', 'Risposta vecchia') : day('p/D2', 'Risposta nuova') } }],
      })
      // The browser aborted the held request when the query changed.
      .catch(() => undefined);
  });
  await page.goto('/desk');
  await page.getByRole('button', { name: 'Cerca o esegui, scorciatoia Ctrl K' }).click();
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  const field = palette.getByRole('combobox');
  await expect(palette.getByRole('option', { name: /Avvia Pomodoro/ })).toBeVisible();
  await field.fill('re');
  const asked = page.waitForRequest((request) => request.url().includes('study.searchRecords'));
  await asked;
  await field.fill('rea');
  await expect(palette.getByRole('option', { name: /Risposta nuova/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(palette.getByRole('option', { name: /Risposta nuova/ })).toBeVisible();
  await expect(palette.getByRole('option', { name: /Risposta vecchia/ })).toHaveCount(0);
});
