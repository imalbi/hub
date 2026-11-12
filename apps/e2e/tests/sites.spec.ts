import { expect, test } from './fixtures.ts';
import { SERVER_URL } from './hosts.ts';

async function configure(request: import('@playwright/test').APIRequestContext, enabled: boolean) {
  await request.post(`${SERVER_URL}/__fake/sites`, { data: { enabled } });
  await expect
    .poll(
      async () => {
        try {
          const response = await request.get('/trpc/sites.state');
          const data: unknown = await response.json();
          return JSON.stringify(data).includes('https://example.com/up');
        } catch {
          return null;
        }
      },
      { timeout: 15000 },
    )
    .toBe(enabled);
}

test('Siti shows daily history and the widget lists only unreachable sites', async ({ page, pc, request }) => {
  await configure(request, true);
  try {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.goto('/desk/lavoro');
    await expect(page.getByRole('heading', { name: 'Alcuni siti non sono raggiungibili' })).toBeVisible();
    const history = page.getByRole('button', { name: 'Sito non raggiungibile' });
    await expect(history.locator('[data-bar]')).toHaveCount(90);
    await history.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('status').filter({ hasText: '5 minuti di interruzione' })).toBeVisible();
    await page.keyboard.press('Escape');
    await history.blur();
    await page.addStyleTag({ content: '[data-latency] { visibility: hidden; }' });
    await page.mouse.move(0, 0);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await expect(page).toHaveScreenshot('desk-siti-4k.png', { animations: 'disabled' });
    await page.goto('/desk');
    await page.getByRole('button', { name: 'Modifica', exact: true }).click();
    await page.getByRole('button', { name: 'Aggiungi Siti', exact: true }).click();
    const widget = page.locator('[data-widget="sites"]');
    await expect(widget.getByText('Sito non raggiungibile')).toBeVisible();
    await expect(widget.getByText('Sito pronto')).toHaveCount(0);
    await page.goto('/desk/settings/sites');
    await expect(page.getByRole('heading', { name: 'Siti', level: 2 })).toBeVisible();
    await page.getByRole('textbox', { name: 'Nome riga 1' }).fill('Sito cambiato');
    await page.getByRole('button', { name: 'Salva e riavvia' }).click();
    await expect(page.getByText('Impostazioni salvate, Hub è di nuovo attivo')).toBeVisible({ timeout: 30000 });
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Nome riga 1' })).toHaveValue('Sito cambiato');
  } finally {
    await pc.post('/trpc/layout.reset', {
      data: { zone: 'overview' },
      headers: { 'content-type': 'application/json' },
    });
    await configure(request, false);
  }
});
