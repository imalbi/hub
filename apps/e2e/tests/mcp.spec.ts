import { expect, test } from './fixtures.ts';
import { SERVER_PORT } from './hosts.ts';

async function requestDanger(pc: import('@playwright/test').APIRequestContext) {
  const response = await pc.post(`http://localhost:${SERVER_PORT}/mcp`, {
    headers: { accept: 'application/json, text/event-stream' },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'system.suspend', arguments: { confirmed: true } },
    },
  });
  return response.json();
}

test('desk shows an agent request and can deny it', async ({ page, pc }) => {
  await page.goto('/desk');
  const before = await (await pc.get(`http://localhost:${SERVER_PORT}/__fake/system`)).json();
  await expect.poll(async () => JSON.stringify(await requestDanger(pc))).toContain('awaiting confirmation');
  const dialog = page.getByRole('dialog', { name: 'Richiesta di conferma' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Locale');
  await expect(dialog).toContainText('system.suspend');
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.screenshot({ path: '/tmp/hub-step32-desk.png', fullPage: true });
  await expect(dialog.locator('[data-modal-panel]')).toHaveScreenshot('agent-confirmation-dialog.png');
  await dialog.getByRole('button', { name: 'Rifiuta' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await (await pc.get(`http://localhost:${SERVER_PORT}/__fake/system`)).json()).toEqual(before);
});

test('holding confirms the action on the fake desktop', async ({ page, pc }) => {
  await page.goto('/desk');
  await expect.poll(async () => JSON.stringify(await requestDanger(pc))).toContain('awaiting confirmation');
  const button = page.getByRole('button', { name: 'Tieni premuto per confermare' });
  await button.hover();
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect
    .poll(async () => JSON.stringify(await (await pc.get(`http://localhost:${SERVER_PORT}/__fake/system`)).json()))
    .toContain('suspend');
});
