import { expect, test } from './fixtures.ts';
import { answerQueries, pairDevice, revokeDevices } from './desktop.ts';
import { SERVER_PORT } from './hosts.ts';

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

// With no device paired, the code and its countdown once stacked over the empty state: a live code takes its place.
for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
]) {
  test(`a generated code replaces the empty state in the Dispositivi panel (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await answerQueries(page, { 'devices.list': [] });
    await page.goto('/desk/devices');
    await expect(page.getByRole('heading', { name: 'Nessun dispositivo abbinato' })).toBeVisible();
    await page.getByRole('button', { name: 'Genera codice' }).click();
    await expect(page.getByRole('status', { name: 'Codice di abbinamento' })).toHaveText(/^\d{6}$/);
    await expect(page.getByRole('heading', { name: 'Nessun dispositivo abbinato' })).toHaveCount(0);
    const panel = page.getByRole('region', { name: 'Dispositivi', exact: true });
    expect(await panel.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
  });
}

test('an agent token is shown once, its calls are listed and it can be revoked', async ({ page, pc }) => {
  await page.getByLabel('Nome agente').fill('Agente di prova');
  await page.getByRole('button', { name: 'Crea agente' }).click();
  await expect(page.getByRole('status', { name: 'Token agente' })).not.toBeEmpty();
  const token = await page.getByRole('status', { name: 'Token agente' }).innerText();
  await expect(page.getByText('Agente di prova', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Agent', exact: true })).toHaveScreenshot('agent-section.png', {
    mask: [page.getByRole('status', { name: 'Token agente' })],
  });
  const call = await pc.post(`http://localhost:${SERVER_PORT}/mcp`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'media.playPause', arguments: {} } },
  });
  expect(call.ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole('status', { name: 'Token agente' })).toHaveCount(0);
  await expect(page.getByText('media.playPause', { exact: true })).toBeVisible();
  const revoke = page.getByRole('button', { name: 'Tieni premuto per revocare Agente di prova' });
  await revoke.hover();
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(page.getByText('Agente di prova', { exact: true })).toHaveCount(0);
});

test('no QR is offered while the config has no LAN origin', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Dispositivi' })).toBeVisible();
  await expect(page.getByRole('img', { name: "QR code dell'indirizzo del deck" })).toHaveCount(0);
});

test('with a LAN origin the QR shows the deck address', async ({ page }) => {
  const deckUrl = 'http://hub.example.test:4180/deck';
  // The fake config only lists loopback origins; the LAN case is the server's `deckUrl` unit test plus this answer.
  await answerQueries(page, { 'devices.deckUrl': deckUrl });
  await page.goto('/desk/devices');
  const qr = page.getByRole('img', { name: "QR code dell'indirizzo del deck" });
  await expect(qr).toBeVisible();
  await expect(page.getByText(deckUrl, { exact: true })).toBeVisible();
  // No decoder in the repo: the module drawing is pinned by `qr.test.ts`, here only that the QR is a real drawing.
  expect(await qr.locator('path').getAttribute('d')).toMatch(/^M4 4h1v1h-1z/);
  // A phone camera needs room: at 4K the panel must still hold the QR without scrolling.
  await page.setViewportSize({ width: 3840, height: 2160 });
  const box = await qr.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(150);
  const panel = page.getByRole('region', { name: 'Dispositivi', exact: true });
  expect(await panel.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
});
