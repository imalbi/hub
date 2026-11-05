import { expect, test } from './fixtures.ts';
import { pairDevice, revokeDevices } from './desktop.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/desk/devices');
});

test('the Dispositivi panel lists the device paired in setup', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Dispositivi' })).toBeVisible();
  await expect(page.getByText('iPhone', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Ultimo accesso: /).first()).toBeVisible();
});

test('a code shows six digits and a countdown, and a device that redeems it appears without a reload', async ({
  page,
  pc,
}) => {
  await page.getByRole('button', { name: 'Genera codice' }).click();
  const code = page.getByRole('status', { name: 'Codice di abbinamento' });
  await expect(code).toHaveText(/^\d{6}$/);
  const countdown = page.getByText(/^Scade tra \d+s$/);
  await expect(countdown).toBeVisible();
  // A fresh two-minute code once read 121 s: the panel's clock was a tick behind the server's.
  expect(Number((await countdown.innerText()).match(/\d+/)?.[0])).toBeLessThanOrEqual(120);

  try {
    const redeemed = await pc.post('/trpc/pairing.redeem', {
      data: { code: await code.innerText(), deviceName: 'Late phone' },
      headers: { 'content-type': 'application/json' },
    });
    expect(redeemed.ok()).toBe(true);
    // The list refreshes by itself while a code is on screen.
    await expect(page.getByText('Late phone', { exact: true })).toBeVisible({ timeout: 10_000 });
  } finally {
    await revokeDevices(pc, 'Late phone');
  }
});

test('revoking needs a hold, then the device is gone and its token stops working', async ({ page, pc, phone }) => {
  const token = await pairDevice(pc, 'Doomed phone');
  const health = () => phone.get('/trpc/health', { headers: { authorization: `Bearer ${token}` } });
  try {
    expect((await health()).status()).toBe(200);
    await page.reload();
    const revoke = page.getByRole('button', { name: 'Tieni premuto per revocare Doomed phone' });
    await page.clock.install();
    // A tap, or a release before 800 ms, revokes nothing.
    await revoke.click();
    await revoke.hover();
    await page.mouse.down();
    await page.clock.runFor(500);
    await page.mouse.up();
    await page.clock.runFor(1000);
    await expect(page.getByText('Doomed phone', { exact: true })).toBeVisible();
    expect((await health()).status()).toBe(200);

    await page.mouse.down();
    await page.clock.runFor(900);
    await page.mouse.up();
    await expect(page.getByText('Doomed phone', { exact: true })).toHaveCount(0);
    expect((await health()).status()).toBe(401);
  } finally {
    await revokeDevices(pc, 'Doomed phone');
  }
});

// With no device paired, the code and its countdown stacked over the empty state and pushed the panel past its cell.
for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
]) {
  test(`a generated code fits the Dispositivi widget with no device paired (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/trpc/devices.list*', (route) => route.fulfill({ json: [{ result: { data: [] } }] }));
    await page.goto('/desk/devices');
    await page.getByRole('button', { name: 'Genera codice' }).click();
    await expect(page.getByRole('status', { name: 'Codice di abbinamento' })).toHaveText(/^\d{6}$/);
    const scroller = page.locator('[data-widget="devices"] .overflow-y-auto').first();
    const overflow = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
