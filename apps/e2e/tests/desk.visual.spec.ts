import { expect, test } from '@playwright/test';

// A fixed clock and fixed answers for everything that moves: uptime, the countdown, "last seen", the random code.
const NOW = new Date('2026-11-04T12:00:00Z');
const json = (data: unknown) => [{ result: { data } }];

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.route('**/trpc/health*', (route) => route.fulfill({ json: json({ ok: true, uptime: 42 }) }));
  await page.route('**/trpc/devices.list*', (route) =>
    route.fulfill({
      json: json([
        { id: 1, name: 'iPhone', createdAt: NOW.getTime() - 3_600_000, lastSeenAt: NOW.getTime() - 300_000 },
      ]),
    }),
  );
  await page.goto('/desk');
  await expect(page.getByText('Server attivo da 42s')).toBeVisible();
  await expect(page.getByText('Ultimo accesso: 5 min fa')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
});

test('the desk matches the baseline', async ({ page }) => {
  await expect(page).toHaveScreenshot('desk.png', { animations: 'disabled' });
});

test('the desk with a pairing code matches the baseline', async ({ page }) => {
  await page.route('**/trpc/pairing.createCode*', (route) =>
    route.fulfill({ json: json({ code: '123456', expiresAt: NOW.getTime() + 120_000 }) }),
  );
  await page.getByRole('button', { name: 'Genera codice' }).click();
  await expect(page.getByRole('status', { name: 'Codice di abbinamento' })).toHaveText('123456');
  await expect(page.getByText('Scade tra 120s')).toBeVisible();
  await expect(page).toHaveScreenshot('desk-code.png', { animations: 'disabled' });
});
