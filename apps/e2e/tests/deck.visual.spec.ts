import { expect, test } from '@playwright/test';
import { freezePomodoro, pausedPomodoro } from './pomodoro-visual.ts';

// One baseline per screen at 375x812, default (ink) theme. The paired deck must look the same as before pairing existed.
test.describe('the deck', () => {
  test('paired, it matches the baseline', async ({ page }) => {
    await freezePomodoro(page);
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

  test('a paused Pomodoro remains readable on the deck', async ({ page }) => {
    await freezePomodoro(page, pausedPomodoro);
    await page.route('**/trpc/health*', (route) =>
      route.fulfill({ json: [{ result: { data: { ok: true, uptime: 42 } } }] }),
    );
    await page.goto('/deck');
    await expect(page.getByRole('button', { name: /^Pomodoro:/ })).toHaveAccessibleName(/12:30/);
    const fits = await page.getByRole('button', { name: /^Pomodoro:/ }).evaluate((button) => {
      const state = button.querySelector('span:last-child');
      if (!state) return false;
      return (
        state.getBoundingClientRect().right <=
        button.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(button).paddingRight) + 0.5
      );
    });
    expect(fits).toBe(true);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await expect(page).toHaveScreenshot('deck-pomodoro-paused.png', { animations: 'disabled' });
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
