import { expect, test } from './fixtures.ts';

// The fake desktop records lock, power and workspace commands and never runs them; server tests check the argv.
test.beforeEach(async ({ page }) => {
  await page.goto('/desk/system');
});

test('the Sistema zone shows the consumption of the fake powerstat dir', async ({ page }) => {
  const power = page.getByRole('region', { name: 'Consumo' });
  await expect(power.getByText('212 W')).toBeVisible();
  await expect(power.getByText('0,15 kWh oggi')).toBeVisible();
});

test('lock and the workspaces run with a tap, power actions only after a hold', async ({ page }) => {
  const controls = page.getByRole('region', { name: 'Comandi' });
  for (const name of ['Blocca', 'Chat', 'Lettore']) {
    const button = controls.getByRole('button', { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('data-status', 'success');
  }
  const powerOff = controls.getByRole('button', { name: 'Tieni premuto per spegnere il PC' });
  await page.clock.install();
  await powerOff.click();
  await page.clock.runFor(1000);
  await expect(powerOff).toContainText('Spegni');
  await powerOff.hover();
  await page.mouse.down();
  await page.clock.runFor(900);
  await page.mouse.up();
  await expect(powerOff).toContainText('Inviato');
});

test('the hold ring is centered and loading replaces the fingerprint', async ({ page }) => {
  await page.routeWebSocket(/\/trpc/, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      if (!message.toString().includes('system.powerOff')) server.send(message);
    });
  });
  await page.reload();
  const button = page.getByRole('button', { name: 'Tieni premuto per spegnere il PC' });
  await expect(button).toBeVisible();
  const icon = button.locator(':scope > span[aria-hidden="true"]');
  const ring = icon.locator(':scope > svg').first();
  const centers = await Promise.all([icon.boundingBox(), ring.boundingBox()]);
  expect(centers[0]).not.toBeNull();
  expect(centers[1]).not.toBeNull();
  if (!centers[0] || !centers[1]) throw new Error('Missing hold icon geometry');
  expect(Math.abs(centers[0].x + centers[0].width / 2 - centers[1].x - centers[1].width / 2)).toBeLessThan(1);
  expect(Math.abs(centers[0].y + centers[0].height / 2 - centers[1].y - centers[1].height / 2)).toBeLessThan(1);

  await page.clock.install();
  await button.hover();
  await page.mouse.down();
  await page.clock.runFor(800);
  await expect(button).toHaveAttribute('aria-busy', 'true');
  expect(
    await icon
      .locator('span')
      .first()
      .evaluate((element) => getComputedStyle(element).opacity),
  ).toBe('0');
  await page.mouse.up();
});
