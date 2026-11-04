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
