import { expect, test } from '@playwright/test';

// One baseline per screen at 375x812, default (ink) theme. The paired deck must look the same as before pairing existed.
test.describe('the deck', () => {
  test('paired, it matches the baseline', async ({ page }) => {
    // The only moving part on screen is the server uptime; pin it so the pixels do not depend on when the suite runs.
    await page.route('**/trpc/health*', (route) =>
      route.fulfill({ json: [{ result: { data: { ok: true, uptime: 42 } } }] }),
    );
    await page.goto('/deck');
    await expect(page.getByText('Server attivo da 42s')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Uscita audio: Cuffie/ })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await expect(page).toHaveScreenshot('deck.png', { animations: 'disabled' });
  });

  test.describe('unpaired', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('the pairing screen matches the baseline', async ({ page }) => {
      await page.goto('/deck');
      await expect(page.getByRole('heading', { name: 'Abbina questo dispositivo' })).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await expect(page).toHaveScreenshot('pairing.png', { animations: 'disabled' });
    });
  });
});
