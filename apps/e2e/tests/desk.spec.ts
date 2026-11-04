import { expect, test } from '@playwright/test';

test('the page renders and shows the server status', async ({ page }) => {
  await page.goto('/desk');
  await expect(page).toHaveTitle('Hub');
  await expect(page.getByText('Hub', { exact: true })).toBeVisible();
  await expect(page.locator('[data-widget="server"]').getByText(/^\d+ (s|min|h)$/)).toBeVisible();
});
