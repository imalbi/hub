import { expect, test } from '@playwright/test';

// One baseline per layout, named after the project: `/deck` at 375x812, `/desk` at 1920x1080, default (ink) theme.
test('the default state matches the baseline', async ({ page }, testInfo) => {
  const layout = testInfo.project.name;
  // The only moving part on screen is the server uptime; pin it so the pixels do not depend on when the suite runs.
  await page.route('**/trpc/health*', (route) =>
    route.fulfill({ json: [{ result: { data: { ok: true, uptime: 42 } } }] }),
  );
  await page.goto(`/${layout}`);
  await expect(page.getByText('Server attivo da 42s')).toBeVisible();
  if (layout === 'deck') await expect(page.getByRole('button', { name: /^Uscita audio: Cuffie/ })).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(page).toHaveScreenshot(`${layout}.png`, { animations: 'disabled' });
});
