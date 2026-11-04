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
        const time = await page.getByRole('timer', { name: 'Tempo rimanente' }).getByRole('status').innerText();
        return (await tile.getAttribute('aria-label'))?.includes(time);
      })
      .toBe(true);
    await tile.click();
    await expect(tile).toHaveAccessibleName(/in pausa/);
    await expect(page.getByRole('button', { name: 'Riprendi', exact: true })).toBeVisible();
    const remaining = await page.getByRole('timer', { name: 'Tempo rimanente' }).getByRole('status').innerText();
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
