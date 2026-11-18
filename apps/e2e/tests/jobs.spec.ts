import { expect, test } from './fixtures.ts';
import { SERVER_URL } from './hosts.ts';

test('a running job streams output and stops after a hold', async ({ page, request }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk/system?tab=jobs');
  await expect(page.getByRole('heading', { name: 'Nessun job' })).toBeVisible();
  await request.post(`${SERVER_URL}/__fake/jobs`);
  await expect(page.getByText('fake.job').first()).toBeVisible();
  await expect(page.getByText('Riga 3')).toBeVisible();
  await expect(page.getByText(/Durata: \d+ s/).first()).toBeVisible();
  // The activity ball counts the job (and the playing fake track).
  const ball = page.getByRole('button', { name: /^Attività in corso: .*1 job/ });
  await expect(ball).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(ball).toHaveScreenshot('jobs-activity-ball.png', { animations: 'disabled' });
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
