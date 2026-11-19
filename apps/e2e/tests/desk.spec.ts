import { expect, test } from '@playwright/test';

test('the page renders and shows the server status', async ({ page }) => {
  await page.goto('/desk');
  await expect(page).toHaveTitle('Hub');
  await page.goto('/desk/system');
  await expect(page.getByRole('region', { name: 'Server' }).getByText(/^\d+ (s|min|h)$/)).toBeVisible();
});
