import type { Page } from '@playwright/test';
import { DECK_STATE, PHONE_URL } from './hosts.ts';
import { expect, test } from './fixtures.ts';

test.afterEach(async ({ pc }) => {
  const response = await pc.get('/trpc/pomodoro.state');
  if (!(await response.text()).includes('"phase":"idle"')) await pc.post('/trpc/pomodoro.stop', { data: {} });
});

test('deck taps start, pause and resume the timer shown on the desk', async ({ page, browser }) => {
  const phone = await browser.newContext({ storageState: DECK_STATE, viewport: { width: 375, height: 812 } });
  try {
    const deck = await phone.newPage();
    await page.goto('/desk/studio');
    await deck.goto(`${PHONE_URL}/deck`);
    const tile = deck.getByRole('button', { name: /^Pomodoro:/ });
    await expect(tile).toHaveAccessibleName(/Pronto/);
    await tile.click();
    await expect(tile).toHaveAccessibleName(/Studio/);
    await expect(page.getByRole('button', { name: 'Metti in pausa', exact: true })).toBeVisible();
    await expect
      .poll(async () => {
        const time = await page
          .getByRole('timer', { name: 'Tempo rimanente' })
          .locator(':scope > .sr-only')
          .innerText();
        return (await tile.getAttribute('aria-label'))?.includes(time);
      })
      .toBe(true);
    await tile.click();
    await expect(tile).toHaveAccessibleName(/in pausa/);
    await expect(page.getByRole('button', { name: 'Riprendi', exact: true })).toBeVisible();
    const remaining = await page
      .getByRole('timer', { name: 'Tempo rimanente' })
      .locator(':scope > .sr-only')
      .innerText();
    if (!remaining) throw new Error('Timer must expose its remaining time');
    await expect(tile).toHaveAccessibleName(new RegExp(remaining));
    await deck.clock.install();
    await deck.clock.fastForward(10_000);
    await expect(tile).toHaveAccessibleName(new RegExp(remaining));
    await tile.click();
    await expect(page.getByRole('button', { name: 'Metti in pausa', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Salta', exact: true }).click();
    await expect(tile).toHaveAccessibleName(/Pomodoro: Pausa /);
    await page.getByRole('button', { name: 'Ferma', exact: true }).click();
    await expect(tile).toHaveAccessibleName(/Pronto/);
  } finally {
    await phone.close();
  }
});

test('a real short phase ends, pushes the break and adds a completed focus today', async ({ page }) => {
  await page.goto('/desk/studio');
  const count = page.getByText(/Sessioni completate oggi:/);
  const before = Number((await count.innerText()).split(':').at(-1)?.trim());
  await page.getByRole('button', { name: 'Avvia', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Avanzamento Pomodoro' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Pomodoro', exact: true }).getByText('Pausa', { exact: true }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(count).toHaveText(`Sessioni completate oggi: ${before + 1}`);
  await page.getByRole('button', { name: 'Salta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Avvia', exact: true })).toBeVisible();
});

const timeText = (page: Page) => page.getByRole('timer', { name: 'Tempo rimanente' }).locator(':scope > .sr-only');

test('the countdown shows every second exactly once', async ({ page }) => {
  await page.clock.install();
  await page.goto('/desk/studio');
  await page.getByRole('button', { name: 'Avvia', exact: true }).click();
  await expect(timeText(page)).toHaveText('00:06');
  await timeText(page).evaluate((element) => {
    const seen: string[] = [];
    Object.assign(window, { seenTimes: seen });
    new MutationObserver(() => seen.push(element.textContent ?? '')).observe(element, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  });
  for (let second = 0; second < 5; second++) await page.clock.runFor(1000);
  expect(await page.evaluate(() => Reflect.get(window, 'seenTimes'))).toEqual([
    '00:05',
    '00:04',
    '00:03',
    '00:02',
    '00:01',
  ]);
});

test('a client whose clock is an hour off still shows the server time left', async ({ page }) => {
  await page.clock.install({ time: Date.now() + 3_600_000 });
  await page.goto('/desk/studio');
  await page.getByRole('button', { name: 'Avvia', exact: true }).click();
  // Counting with its own clock it would read 00:00 at once.
  await expect(timeText(page)).toHaveText(/^00:0[1-6]$/);
});

test('the settings popover switches the preset and the sound', async ({ page, pc }) => {
  const fixture = { focusMinutes: 0.1, shortBreakMinutes: 0.05, longBreakMinutes: 0.1, longBreakEvery: 4, sound: true };
  const state = async () => (await pc.get('/trpc/pomodoro.state')).text();
  try {
    await page.goto('/desk/studio');
    await page.getByRole('button', { name: 'Impostazioni Pomodoro' }).click();
    const popover = page.getByLabel('Impostazioni Pomodoro', { exact: true }).last();
    await popover.getByText('50/10', { exact: true }).click();
    await expect(popover.getByRole('radio', { name: /^50 minuti di studio/ })).toBeChecked();
    await expect
      .poll(state)
      .toContain('"focusMinutes":50,"shortBreakMinutes":10,"longBreakMinutes":15,"longBreakEvery":0');
    await popover.getByRole('switch', { name: 'Suono a fine fase' }).click();
    await expect.poll(state).toContain('"sound":false');
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
  } finally {
    await pc.post('/trpc/pomodoro.configure', { data: fixture, headers: { 'content-type': 'application/json' } });
  }
});
