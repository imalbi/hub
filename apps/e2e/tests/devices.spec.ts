import { expect, test } from './fixtures.ts';
import { answerQueries, pairDevice, revokeDevices } from './desktop.ts';
import { SERVER_PORT } from './hosts.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/desk/devices');
});

test('the page has the two steps to connect a phone, and who has access with the device paired in setup', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Dispositivi' })).toBeVisible();
  const connect = page.getByRole('region', { name: 'Collega un telefono' });
  await expect(connect.getByRole('listitem')).toHaveCount(2);
  await expect(connect.getByText("Scrivi il codice nell'app")).toBeVisible();
  await expect(connect.getByRole('button', { name: 'Genera codice' })).toBeVisible();
  // No LAN origin in the fixture config: step 1 says what is missing instead of offering a QR.
  await expect(connect.getByText(/serve la rete locale/)).toBeVisible();
  const access = page.getByRole('region', { name: 'Chi ha accesso' });
  await expect(
    access.getByRole('region', { name: 'Telefoni e tablet' }).getByText('iPhone', { exact: true }),
  ).toBeVisible();
  await expect(access.getByText(/^Ultimo accesso: /).first()).toBeVisible();
  await expect(access.getByRole('region', { name: 'Agent', exact: true })).toBeVisible();
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

// The code and its countdown once stacked over the empty state of the same panel; they now live in step 2 on the left.
for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
]) {
  test(`a generated code sits in step 2 beside the empty list, nothing clipped (${viewport.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await answerQueries(page, { 'devices.list': [] });
    await page.goto('/desk/devices');
    await expect(page.getByRole('heading', { name: 'Nessun dispositivo abbinato' })).toBeVisible();
    await page.getByRole('button', { name: 'Genera codice' }).click();
    const code = page.getByRole('status', { name: 'Codice di abbinamento' });
    await expect(code).toHaveText(/^\d{6}$/);
    await expect(page.getByRole('heading', { name: 'Nessun dispositivo abbinato' })).toBeVisible();
    // The left panel never overflows; the right one is as tall as the surface and scrolls (step 47b), so it may.
    const connect = page.getByRole('region', { name: 'Collega un telefono', exact: true });
    expect(await connect.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
  });
}

test('Copia comando puts the local MCP command on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const command = 'claude mcp add --scope user --transport http hub http://127.0.0.1:4180/mcp';
  await expect(page.getByText(command, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Copia comando' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command);
});

test('Su questo PC lists the calls a local agent made over loopback', async ({ page, pc }) => {
  const call = await pc.post(`http://localhost:${SERVER_PORT}/mcp`, {
    headers: { accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'media.playPause', arguments: {} } },
  });
  expect(call.ok()).toBe(true);
  await page.reload();
  const agent = page.getByRole('region', { name: 'Agent', exact: true });
  await expect(agent.getByText(/^\d+ chiamat[ae] oggi, ultima media\.playPause /)).toBeVisible();
  // Calls are shown on demand, like the ones of a token agent.
  await expect(agent.getByText('media.playPause', { exact: true })).toHaveCount(0);
  await agent.getByRole('button', { name: 'Chiamate di Su questo PC' }).click();
  await expect(agent.getByText('media.playPause', { exact: true })).toBeVisible();
});

test('the token form is in a closed disclosure; a token is shown once, its calls are listed and it can be revoked', async ({
  page,
  pc,
}) => {
  // The local row is covered by its own test; the shot must not depend on the calls other specs made.
  await answerQueries(page, { 'agents.localCalls': [], 'agents.localCallsToday': 0 });
  await page.goto('/desk/devices');
  const name = page.getByLabel('Nome agente');
  await expect(name).toBeHidden();
  await page.getByText('Agent da un altro PC', { exact: true }).click();
  await name.fill('Agente di prova');
  await page.getByRole('button', { name: 'Crea token' }).click();
  await expect(page.getByRole('status', { name: 'Token agente' })).not.toBeEmpty();
  const token = await page.getByRole('status', { name: 'Token agente' }).innerText();
  await expect(page.getByText('Agente di prova', { exact: true })).toBeVisible();
  await expect(page.getByText('Token, nessuna chiamata')).toBeVisible();
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
  await page.getByRole('button', { name: 'Chiamate di Agente di prova' }).click();
  await expect(page.getByText('media.playPause', { exact: true }).first()).toBeVisible();
  const revoke = page.getByRole('button', { name: 'Tieni premuto per revocare Agente di prova' });
  await revoke.hover();
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(page.getByText('Agente di prova', { exact: true })).toHaveCount(0);
});

test('no QR action is offered while the config has no LAN origin', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Dispositivi' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Genera codice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mostra QR' })).toHaveCount(0);
  await expect(page.getByRole('img', { name: "QR code dell'indirizzo del deck" })).toHaveCount(0);
});

test('with a LAN origin Mostra QR opens a dialog with the QR and the address, Escape closes it', async ({ page }) => {
  const deckUrl = 'http://hub.example.test:4180/deck';
  // The fake config only lists loopback origins; the LAN case is the server's `deckUrl` unit test plus this answer.
  await answerQueries(page, { 'devices.deckUrl': deckUrl });
  await page.goto('/desk/devices');
  const qr = page.getByRole('img', { name: "QR code dell'indirizzo del deck" });
  // Not inline: the QR exists only inside the dialog.
  await expect(qr).toHaveCount(0);
  await page.getByRole('button', { name: 'Mostra QR' }).click();
  const dialog = page.getByRole('dialog', { name: 'Apri il deck da un telefono' });
  await expect(dialog).toBeVisible();
  await expect(qr).toBeVisible();
  await expect(dialog.getByText(deckUrl, { exact: true })).toBeVisible();
  // No decoder in the repo: the module drawing is pinned by `qr.test.ts`, here only that the QR is a real drawing.
  expect(await qr.locator('path').getAttribute('d')).toMatch(/^M4 4h1v1h-1z/);
  // A phone camera needs room.
  expect((await qr.boundingBox())?.width).toBeGreaterThanOrEqual(150);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('the page is a 5/7 split at the surface height with a dashed step separator, the count and the day count; the right panel scrolls', async ({
  page,
}) => {
  const now = Date.now();
  const devices = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    name: `Telefono ${i + 1}`,
    createdAt: now,
    lastSeenAt: now - 60_000,
  }));
  await answerQueries(page, {
    'devices.list': devices,
    'agents.list': [{ id: 1, name: 'Portatile', createdAt: now }],
    'agents.localCalls': [{ id: 1, action: 'study.setStep', createdAt: new Date(now - 120_000).toISOString() }],
    'agents.localCallsToday': 18,
  });
  await page.reload();
  const access = page.getByRole('region', { name: 'Chi ha accesso' });
  await expect(access.getByText('10 dispositivi, 1 agent remoto')).toBeVisible();
  await expect(access.getByText('18 chiamate oggi, ultima study.setStep 2 min fa')).toBeVisible();
  const connect = await page.getByRole('region', { name: 'Collega un telefono' }).boundingBox();
  const right = await access.boundingBox();
  const surface = await page.locator('[data-page-surface]').boundingBox();
  expect(connect && right && surface).toBeTruthy();
  if (!connect || !right || !surface) return;
  // 5 and 7 of 12 columns: the right panel is 7/5 as wide as the left column (the gap is shared).
  expect(Math.abs(right.width / connect.width - 7 / 5)).toBeLessThan(0.05);
  // Both columns reach the bottom of the surface padding, above the status line at the foot of the surface (step 68).
  const foot = await page.getByRole('contentinfo', { name: 'Stato di Hub' }).boundingBox();
  expect(foot && foot.y > right.y && foot.y + foot.height <= surface.y + surface.height + 1).toBe(true);
  if (!foot) return;
  expect(Math.abs(right.y + right.height - (foot.y - 36))).toBeLessThan(40);
  expect(await access.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const second = page.getByRole('region', { name: 'Collega un telefono' }).getByRole('listitem').nth(1);
  await expect(second).toHaveCSS('border-top-style', 'dashed');
});
