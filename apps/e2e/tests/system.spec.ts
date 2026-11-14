import { expect, test } from './fixtures.ts';
import { SERVER_URL } from './hosts.ts';

// The fake desktop records lock, power, workspace and monitor commands and never runs them; server tests check the argv.
test.beforeEach(async ({ page }) => {
  await page.goto('/desk/system');
});

const thisPc = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Questo PC' });

test('the Sistema zone shows the consumption of the fake powerstat dir and the server uptime', async ({ page }) => {
  const power = page.getByRole('region', { name: 'Consumo' });
  await expect(power.getByText('212 W')).toBeVisible();
  await expect(power.getByText('Consumo, 0,15 kWh oggi')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Server' })).toBeVisible();
});

test('without a powerstat directory Consumo is gone and Server takes the whole bottom row', async ({ page }) => {
  // The page's own subscription answers `null`, which is what the server sends when `powerstatDir` is not set.
  await page.routeWebSocket(/\/trpc/, (socket) => {
    const server = socket.connectToServer();
    const powerIds = new Set<unknown>();
    socket.onMessage((message) => {
      for (const request of [JSON.parse(message.toString())].flat())
        if (request?.params?.path === 'system.onPower') powerIds.add(request.id);
      server.send(message);
    });
    server.onMessage((message) => {
      const reply = JSON.parse(message.toString());
      if (powerIds.has(reply?.id) && reply.result?.type === 'data')
        socket.send(JSON.stringify({ ...reply, result: { ...reply.result, data: null } }));
      else socket.send(message);
    });
  });
  await page.reload();
  const server = page.getByRole('region', { name: 'Server' });
  await expect(server).toBeVisible();
  await expect(page.getByRole('region', { name: 'Consumo' })).toHaveCount(0);
  const audio = await page.getByRole('region', { name: 'Audio', exact: true }).boundingBox();
  const figure = await server.boundingBox();
  if (!audio || !figure) throw new Error('missing box');
  // Alone in its row: about the whole panel width, not half of it.
  expect(figure.width).toBeGreaterThan(audio.width * 0.8);
});

test('lock and the workspaces run with a tap, power actions only after a hold', async ({ page }) => {
  const pc = thisPc(page);
  for (const [row, name] of [
    ['Blocca lo schermo', 'Blocca'],
    ['Chat', 'Apri o chiudi Chat'],
    ['Lettore', 'Apri o chiudi Lettore'],
  ]) {
    const button = pc.getByRole('group', { name: row, exact: true }).getByRole('button', { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('data-status', 'success');
  }
  const powerOff = pc.getByRole('button', { name: 'Tieni premuto per spegnere il PC' });
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

test('the rows keep the order of the board: this PC, then the audio rows, readings last', async ({ page }) => {
  const pcRows = thisPc(page).getByRole('group');
  await expect(pcRows.first()).toHaveAccessibleName('Blocca lo schermo');
  const names = await pcRows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
  expect(names.slice(0, 5)).toEqual(['Blocca lo schermo', 'Chat', 'Lettore', 'Webcam', 'Monitor verticale']);
  const audio = page.getByRole('region', { name: 'Audio', exact: true });
  await expect(audio.getByRole('toolbar', { name: 'Uscite configurate' })).toBeVisible();
  await expect(audio.getByRole('slider', { name: 'Volume' })).toBeVisible();
  await expect(audio.getByRole('button', { name: 'Silenzia uscita audio' })).toBeVisible();
  await expect(audio.getByRole('button', { name: 'Silenzia microfono' })).toBeVisible();
});

test('a monitor row turns its own monitor on and off and follows the owner shortcut', async ({ page, pc }) => {
  const row = (label: string) => thisPc(page).getByRole('group', { name: label, exact: true });
  const calls = async () => (await (await pc.get(`${SERVER_URL}/__fake/system`)).json()).calls;
  const before = (await calls()).length;
  try {
    await expect(row('Monitor verticale')).toContainText('Spento');
    await row('Monitor verticale').getByRole('button', { name: 'Accendi Monitor verticale' }).click();
    await expect(row('Monitor verticale')).toContainText('Acceso');
    await expect(row('Monitor verticale').getByRole('button', { name: 'Spegni Monitor verticale' })).toBeVisible();
    expect((await calls()).slice(before)).toEqual([['fake-monitor-DP-2']]);
    // The shortcut flips it without Hub being asked; the row catches up at the next poll.
    await pc.post(`${SERVER_URL}/__fake/monitor`, { data: { output: 'DP-2', disabled: true } });
    await expect(row('Monitor verticale')).toContainText('Spento', { timeout: 15_000 });
  } finally {
    await pc.post(`${SERVER_URL}/__fake/monitor`, { data: { output: 'DP-2', disabled: true } });
  }
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

// Chromium runs with its fake camera and microphone (playwright.config.ts), so the preview is real.
test('the webcam dialog shows the camera, and closing it ends every track, also on a route change', async ({
  page,
}) => {
  const open = () => thisPc(page).getByRole('button', { name: 'Anteprima webcam' }).click();
  const dialog = page.getByRole('dialog', { name: 'Anteprima webcam' });
  await open();
  const video = dialog.locator('video');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((el) => el instanceof HTMLVideoElement && el.videoWidth > 0)).toBe(true);
  await expect(dialog.getByRole('meter', { name: 'Livello del microfono' })).toBeAttached();
  const tracks = await video.evaluateHandle((el) =>
    el instanceof HTMLVideoElement && el.srcObject instanceof MediaStream ? el.srcObject.getTracks() : [],
  );
  const states = () => tracks.evaluate((list) => list.map((track) => track.readyState));
  expect(await states()).toEqual(['live', 'live']);

  await dialog.getByRole('button', { name: "Chiudi l'anteprima" }).click();
  await expect.poll(states).toEqual(['ended', 'ended']);

  await open();
  const second = await dialog
    .locator('video')
    .evaluateHandle((el) =>
      el instanceof HTMLVideoElement && el.srcObject instanceof MediaStream ? el.srcObject.getTracks() : [],
    );
  await expect.poll(() => second.evaluate((list) => list.map((track) => track.readyState))).toEqual(['live', 'live']);
  // The rail link sits behind the modal, so navigate the way a shortcut would: the app router, not a click.
  await page.evaluate(() => history.pushState({}, '', '/desk/devices'));
  await page.evaluate(() => dispatchEvent(new PopStateEvent('popstate')));
  await expect(page.getByRole('heading', { level: 1, name: 'Dispositivi' })).toBeVisible();
  await expect.poll(() => second.evaluate((list) => list.map((track) => track.readyState))).toEqual(['ended', 'ended']);
});

for (const [name, sentence] of [
  ['NotAllowedError', 'Permesso negato: consenti webcam e microfono a questo sito nelle impostazioni del browser.'],
  ['NotFoundError', 'Nessuna webcam trovata su questo PC.'],
] as const) {
  test(`the webcam dialog says so when the browser answers ${name}`, async ({ page }) => {
    await page.addInitScript((errorName) => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('refused', errorName));
    }, name);
    await page.reload();
    await thisPc(page).getByRole('button', { name: 'Anteprima webcam' }).click();
    const dialog = page.getByRole('dialog', { name: 'Anteprima webcam' });
    await expect(dialog.getByRole('alert')).toHaveText(sentence);
    await expect(dialog.locator('video')).toHaveCount(0);
  });
}
