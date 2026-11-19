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
  await expect(page.getByText(/schermata Home/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Uscita audio/ })).toHaveCount(0);
});

test('Safari shows the Home instructions before a usable dimmed form', async ({ page, pc }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: false }));
  const deviceName = 'Safari pairing test';
  try {
    const response = await pc.post('/trpc/pairing.createCode', { data: {} });
    const { code } = (await response.json()).result.data;
    await page.goto('/deck');
    const heading = page.getByRole('heading', { name: 'Prima aggiungi Hub alla Home' });
    const form = page.locator('form');
    await expect(heading).toBeVisible();
    expect(
      await heading.evaluate(
        (element, formElement) =>
          Boolean(element.compareDocumentPosition(formElement) & Node.DOCUMENT_POSITION_FOLLOWING),
        await form.elementHandle(),
      ),
    ).toBe(true);
    await expect(form).toHaveCSS('opacity', '0.6');
    await page.getByLabel('Codice').fill(code);
    await page.getByLabel('Nome del dispositivo').fill(deviceName);
    await page.getByRole('button', { name: 'Abbina' }).click();
    await expect(page.getByRole('button', { name: /^Uscita audio/ })).toBeVisible();
  } finally {
    await revokeDevices(pc, deviceName);
  }
});

test('the Home app has no install instruction', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.goto('/deck');
  await expect(page.getByText(/schermata Home/)).toHaveCount(0);
});

test('the code and device name fields have equal height', async ({ page }) => {
  await page.goto('/deck');
  const code = await page.getByLabel('Codice').boundingBox();
  const name = await page.getByLabel('Nome del dispositivo').boundingBox();
  expect(code?.height).toBeDefined();
  expect(code?.height).toBe(name?.height);
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
