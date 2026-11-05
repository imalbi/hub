import { expect, test } from '@playwright/test';
import { DECK_STATE, PHONE_URL } from './hosts.ts';
import { freezePomodoro } from './pomodoro-visual.ts';

if (process.env.HUB_EXAMPLE_MODULES === '1') {
  test('example module adds a zone, a configurable panel and a synchronized deck tile', async ({ page, browser }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await freezePomodoro(page);
    await page.goto('/desk');
    await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Esempio', exact: true }).click();
    await expect(page).toHaveURL(/\/desk\/hello$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Esempio' })).toBeVisible();
    await expect(page.getByText('Ciao dal modulo di esempio', { exact: true })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('desk-example-4k.png', { animations: 'disabled' });

    const context = await browser.newContext({
      storageState: DECK_STATE,
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 3,
    });
    try {
      const phone = await context.newPage();
      await freezePomodoro(phone);
      // The deck header shows the server uptime; pin it like the other visual specs, or the baseline depends on timing.
      await phone.route('**/trpc/health*', (route) =>
        route.fulfill({ json: [{ result: { data: { ok: true, uptime: 42 } } }] }),
      );
      await phone.goto(`${PHONE_URL}/deck`);
      await phone.getByRole('button', { name: 'Vai a Esempio' }).click();
      const tile = phone.getByRole('button', { name: 'Esempio: Saluti: 0', exact: true });
      await expect(tile).toBeVisible();
      await phone.evaluate(async () => {
        await document.fonts.ready;
      });
      await expect(phone).toHaveScreenshot('deck-example.png', { animations: 'disabled', scale: 'css' });
      await tile.click();
      await expect(phone.getByRole('button', { name: 'Esempio: Saluti: 1', exact: true })).toBeVisible();
      await expect(
        page.getByRole('region', { name: 'Esempio', exact: true }).getByText('1', { exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Saluta', exact: true }).click();
      await expect(phone.getByRole('button', { name: 'Esempio: Saluti: 2', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Modifica', exact: true }).click();
      // The size radios are visually hidden inside their labels: click the label, as widgets.spec.ts does.
      const saved = page.waitForResponse((res) => res.url().includes('/trpc/layout.save') && res.ok());
      await page
        .getByRole('group', { name: 'Dimensione di Esempio' })
        .locator('label', { has: page.getByRole('radio', { name: 'Grande', exact: true }) })
        .click();
      await saved;
      await page.reload();
      await expect(page.locator('[data-widget="hello"]')).toHaveAttribute('data-size', 'large');
      await page.getByRole('button', { name: 'Modifica', exact: true }).click();
      await page.getByRole('button', { name: 'Ripristina', exact: true }).click();
      await expect(page.locator('[data-widget="hello"]')).toHaveAttribute('data-size', 'medium');
      await page.goto('/desk');
      await page.getByRole('button', { name: 'Modifica', exact: true }).click();
      await page.getByRole('button', { name: 'Aggiungi Esempio', exact: true }).click();
      await expect(page.getByText('Ciao dal modulo di esempio', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Ripristina', exact: true }).click();
    } finally {
      await context.close();
    }
  });
} else {
  test('example UI and actions are absent without the flag', async ({ page, request }) => {
    await page.goto('/desk');
    await expect(
      page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Esempio', exact: true }),
    ).toHaveCount(0);
    expect((await request.get('/trpc/hello.state')).status()).toBe(404);
  });
}
