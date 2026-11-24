import { expect, test, type Page } from '@playwright/test';
import { freezePomodoro, pausedPomodoro } from './pomodoro-visual.ts';

const examples = process.env.HUB_EXAMPLE_MODULES === '1';
const baseline = (name: string) => (examples ? name.replace('.png', '-example.png') : name);

async function waitForDeckCover(page: Page) {
  const player = page.getByRole('region', { name: 'In riproduzione' });
  await expect(player.locator('[data-fade-image] img')).toHaveAttribute('data-image-loaded', 'true');
  await expect.poll(() => player.locator('[data-fade-image]').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
}

// One baseline per screen at 375x812, default (ink) theme. The paired deck must look the same as before pairing existed.
test.describe('the deck', () => {
  test('paired, it matches the baseline', async ({ page }) => {
    await freezePomodoro(page);
    await page.goto('/deck');
    await expect(page.getByRole('region', { name: 'In riproduzione' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Uscita audio: Cuffie/ })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Posta: 3 non lette' })).toBeVisible();
    await waitForDeckCover(page);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await expect(page).toHaveScreenshot(baseline('deck.png'), { animations: 'disabled' });
  });

  test('a paused Pomodoro remains readable on the deck', async ({ page }) => {
    await freezePomodoro(page, pausedPomodoro);
    await page.route('**/trpc/health*', (route) =>
      route.fulfill({ json: [{ result: { data: { ok: true, uptime: 42 } } }] }),
    );
    await page.goto('/deck');
    await expect(page.getByRole('button', { name: /^Pomodoro:/ })).toHaveAccessibleName(/12:30/);
    await expect(page.getByRole('region', { name: 'In riproduzione' })).toBeVisible();
    const fits = await page.getByRole('button', { name: /^Pomodoro:/ }).evaluate((button) => {
      const state = button.querySelector('span:last-child');
      if (!state) return false;
      return (
        state.getBoundingClientRect().right <=
        button.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(button).paddingRight) + 0.5
      );
    });
    expect(fits).toBe(true);
    await waitForDeckCover(page);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await expect(page).toHaveScreenshot(baseline('deck-pomodoro-paused.png'), { animations: 'disabled' });
  });

  for (const deckPage of [{ name: 'Sistema', file: 'deck-system.png' }]) {
    test(`the ${deckPage.name} page matches the baseline`, async ({ page }) => {
      await freezePomodoro(page);
      await page.route('**/trpc/health*', (route) =>
        route.fulfill({ json: [{ result: { data: { ok: true, uptime: 42 } } }] }),
      );
      await page.goto('/deck');
      await page.getByRole('button', { name: `Vai a ${deckPage.name}` }).click();
      await expect(page.getByRole('button', { name: `Vai a ${deckPage.name}` })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.getByRole('region', { name: deckPage.name })).toBeInViewport({ ratio: 1 });
      await waitForDeckCover(page);
      await page.evaluate(async () => {
        await document.fonts.ready;
        localStorage.removeItem('hub.deck.page');
      });
      await expect(page).toHaveScreenshot(baseline(deckPage.file), { animations: 'disabled' });
    });
  }

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

    test('the Safari pairing screen matches the baseline', async ({ page }) => {
      await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: false }));
      await page.goto('/deck');
      await expect(page.getByRole('heading', { name: 'Prima aggiungi Hub alla Home' })).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await expect(page).toHaveScreenshot('pairing-safari.png', { animations: 'disabled' });
    });
  });
});
