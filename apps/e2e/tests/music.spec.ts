import { expect, test } from './fixtures.ts';
import { restoreDesktop } from './desktop.ts';
test.afterEach(async ({ pc }) => restoreDesktop(pc));

test('player exposes position and seeks with the keyboard', async ({ page }) => {
  await page.goto('/desk/media');
  const player = page.getByRole('region', { name: 'Player musicale' });
  const slider = player.getByRole('slider', { name: 'Posizione del brano' });
  await expect(slider).toHaveAttribute('aria-valuetext', '0:12');
  await slider.focus();
  const request = page.waitForRequest((r) => r.url().includes('media.seek') && r.method() === 'POST');
  await slider.press('ArrowRight');
  expect((await request).postData()).toContain('13');
  await expect(slider).toHaveAttribute('aria-valuetext', '0:13');
});

test('seek bar keeps keyboard focus after a click while the seek is slow', async ({ page }) => {
  // Regression (owner, 2026-11-11): a click seeked, then the arrows did nothing. The slider was disabled while the
  // seek was pending, which took focus away from it.
  await page.route('**/trpc/media.seek**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.goto('/desk/media');
  const slider = page
    .getByRole('region', { name: 'Player musicale' })
    .getByRole('slider', { name: 'Posizione del brano' });
  await expect(slider).toBeVisible();
  const box = await slider.boundingBox();
  if (!box) throw new Error('slider not laid out');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(slider).toBeFocused();
  await page.waitForTimeout(100);
  await expect(slider).toBeFocused();
  const second = page.waitForRequest((r) => r.url().includes('media.seek') && r.method() === 'POST');
  await page.keyboard.press('ArrowRight');
  await second;
});
