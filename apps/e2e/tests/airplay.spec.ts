import type { Browser } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { DECK_STATE, PHONE_URL } from './hosts.ts';

const examples = process.env.HUB_EXAMPLE_MODULES === '1';

async function openDeck(browser: Browser) {
  const context = await browser.newContext({
    storageState: DECK_STATE,
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 3,
  });
  const phone = await context.newPage();
  await phone.goto(`${PHONE_URL}/deck`);
  return { context, phone };
}

if (examples) {
  test.afterEach(({ pc }) => pc.post('/trpc/airplay.stop', { data: {} }));

  test('the Dispositivi row and the deck tile drive one receiver and follow each other', async ({
    page,
    browser,
    pc,
  }) => {
    const { context, phone } = await openDeck(browser);
    try {
      await page.goto('/desk/devices');
      const row = page.getByRole('region', { name: 'Collegati a questo PC' }).getByRole('group', { name: 'AirPlay' });
      const toggle = row.getByRole('button', { name: /^AirPlay:/ });
      const tile = phone.getByRole('button', { name: /^AirPlay:/ });
      await expect(toggle).toHaveAccessibleName('AirPlay: Disattivato');
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await expect(tile).toHaveAccessibleName('AirPlay: Disattivato');

      await toggle.click();
      await expect(toggle).toHaveAccessibleName('AirPlay: Attivo');
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(tile).toHaveAccessibleName('AirPlay: Attivo');
      expect((await (await pc.get('/trpc/airplay.state')).json()).result.data).toEqual({ running: true });

      await tile.click();
      await expect(tile).toHaveAccessibleName('AirPlay: Disattivato');
      await expect(toggle).toHaveAccessibleName('AirPlay: Disattivato');
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect((await (await pc.get('/trpc/airplay.state')).json()).result.data).toEqual({ running: false });
    } finally {
      await context.close();
    }
  });

  test('Scrivania keeps the AirPlay tile right before Pomodoro', async ({ browser }) => {
    const { context, phone } = await openDeck(browser);
    try {
      const desk = phone.getByRole('region', { name: 'Scrivania', exact: true });
      await expect(desk.getByRole('button')).toHaveCount(12);
      await expect(desk.getByRole('button').nth(9)).toHaveAccessibleName(/^Blocca:/);
      await expect(desk.getByRole('button').nth(10)).toHaveAccessibleName(/^AirPlay:/);
      await expect(desk.getByRole('button').nth(11)).toHaveAccessibleName(/^Pomodoro:/);
    } finally {
      await context.close();
    }
  });
} else {
  test('without the module there is no row, no tile and no AirPlay action', async ({ page, browser, pc }) => {
    await page.goto('/desk/devices');
    await expect(page.getByRole('region', { name: 'Dispositivi' }).first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Collegati a questo PC' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'AirPlay' })).toHaveCount(0);

    const registry: Array<{ path: string }> = (await (await pc.get('/trpc/registry.list')).json()).result.data;
    expect(registry.filter((action) => action.path.startsWith('airplay.'))).toEqual([]);
    await page.getByRole('button', { name: 'Cerca o esegui, scorciatoia Ctrl K' }).click();
    const palette = page.getByRole('dialog', { name: 'Comandi' });
    // The list is loaded once an action every install has is there; the search is fuzzy, so only AirPlay's own names matter.
    await expect(palette.getByRole('option', { name: /Avvia Pomodoro/ })).toBeVisible();
    await palette.getByRole('combobox').fill('AirPlay');
    await expect(palette.getByRole('option', { name: /AirPlay/ })).toHaveCount(0);
    expect((await pc.get('/trpc/airplay.state')).status()).toBe(404);

    const { context, phone } = await openDeck(browser);
    try {
      await expect(phone.getByRole('region', { name: 'Scrivania', exact: true }).getByRole('button')).toHaveCount(11);
      await expect(phone.getByRole('button', { name: /^AirPlay:/ })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
