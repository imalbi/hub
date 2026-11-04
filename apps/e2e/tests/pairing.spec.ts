import { expect, test } from './fixtures.ts';
import { pairDevice, revokeDevices } from './desktop.ts';

// Everything here starts from a browser that has not paired.
test.use({ storageState: { cookies: [], origins: [] } });

const pairingTitle = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { name: 'Abbina questo dispositivo' });

test('an unpaired deck shows the pairing screen and no tile', async ({ page }) => {
  await page.goto('/deck');
  await expect(pairingTitle(page)).toBeVisible();
  await expect(page.getByLabel('Codice')).toHaveAttribute('inputmode', 'numeric');
  await expect(page.getByLabel('Codice')).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(page.getByLabel('Nome del dispositivo')).toHaveValue('iPhone');
  // Not running as a Home screen app: the hint says to install first.
  await expect(page.getByText(/schermata Home/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Uscita audio/ })).toHaveCount(0);
});

test('a wrong code is refused and the pairing screen stays', async ({ page }) => {
  await page.goto('/deck');
  await page.getByLabel('Codice').fill('000000');
  await page.getByRole('button', { name: 'Abbina' }).click();
  await expect(page.getByRole('alert')).toHaveText('Codice non valido o scaduto');
  await expect(pairingTitle(page)).toBeVisible();
});

test('a token the server does not know sends the deck back to the pairing screen', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hub.token', 'made-up-token'));
  await page.goto('/deck');
  await expect(pairingTitle(page)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('hub.token'))).toBeNull();
});

test('revoking a device from the PC sends its open deck back to the pairing screen', async ({ page, pc }) => {
  const token = await pairDevice(pc, 'Revoked deck');
  try {
    await page.addInitScript((value) => localStorage.setItem('hub.token', value), token);
    await page.goto('/deck');
    await expect(page.getByRole('button', { name: /^Uscita audio: Cuffie/ })).toBeVisible();

    await revokeDevices(pc, 'Revoked deck');
    // The server closes the socket, the client reconnects with the dead token and is told to pair again.
    await expect(pairingTitle(page)).toBeVisible({ timeout: 15_000 });
  } finally {
    await revokeDevices(pc, 'Revoked deck');
  }
});
