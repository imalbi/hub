import { expect, test } from './fixtures.ts';
import { SERVER_URL } from './hosts.ts';

test('a running job streams output and stops after a hold', async ({ page, request }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk/system?tab=jobs');
  await request.post(`${SERVER_URL}/__fake/jobs`);
  await expect(page.getByText('fake.job').first()).toBeVisible();
  await expect(page.getByText('Riga 3')).toBeVisible();
  await expect(page.getByText(/Durata: \d+ s/).first()).toBeVisible();
  const pill = page.getByRole('button', { name: /Job in esecuzione/ });
  await expect(pill).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(pill).toHaveScreenshot('jobs-header-pill.png', { animations: 'disabled' });
  const cancel = page.getByRole('button', { name: 'Tieni premuto per annullare job' });
  await cancel.click();
  await expect(page.getByRole('button', { name: /fake\.job In esecuzione/ })).toBeVisible();
  await cancel.hover();
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: /fake\.job Annullato/ }).first()).toBeVisible();
  const log = page.locator('section[aria-label="Output"]').nth(1);
  await page.addStyleTag({
    content:
      'ul li:nth-child(n+4) { display: none } time { visibility: hidden } button[aria-pressed] .tabular-nums { display: none }',
  });
  await expect(log).toHaveScreenshot('jobs-log-4k.png', { animations: 'disabled' });
});
