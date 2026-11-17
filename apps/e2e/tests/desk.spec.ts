import { expect, test } from '@playwright/test';

test('the page renders and shows the server status', async ({ page }) => {
  await page.goto('/desk');
  await expect(page).toHaveTitle('Hub');
  // The uptime moved from the Server widget to the status line (step 68); the widget is no longer in the default layout.
  await expect(page.getByRole('contentinfo', { name: 'Stato di Hub' }).getByText(/^\d+ (s|min|h)$/)).toBeVisible();
});
