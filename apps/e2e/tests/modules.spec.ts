import { expect, test, type Page } from '@playwright/test';
import { DECK_STATE, PHONE_URL } from './hosts.ts';
import { freezePomodoro } from './pomodoro-visual.ts';

const rail = (page: Page) => page.getByRole('navigation', { name: 'Zone' });

if (process.env.HUB_EXAMPLE_MODULES === '1') {
  test('example module adds a zone page, a configurable widget and a synchronized deck tile', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await freezePomodoro(page);
    await page.goto('/desk');
    await page.locator('[data-widget="today"]').getByRole('link', { name: 'Ciao dal modulo di esempio' }).click();
    await expect(page).toHaveURL(/\/desk\/hello$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Esempio' })).toBeVisible();
    await expect(page.getByText('Ciao dal modulo di esempio', { exact: true })).toBeVisible();
    // A module zone is a page: no edit mode, no board, and one tab means no bar.
    await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-widget]')).toHaveCount(0);
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('desk-example-4k.png', { animations: 'disabled' });

    const context = await browser.newContext({
      storageState: DECK_STATE,
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 3,
    });
    try {
      const phone = await context.newPage();
      await freezePomodoro(phone);
      // The deck header shows the server uptime; pin it like the other visual specs, or the baseline depends on timing.
      await phone.route('**/trpc/health*', (route) =>
        route.fulfill({ json: [{ result: { data: { ok: true, uptime: 42 } } }] }),
      );
      await phone.goto(`${PHONE_URL}/deck`);
      await phone.getByRole('button', { name: 'Vai a Esempio' }).click();
      const tile = phone.getByRole('button', { name: 'Esempio: Saluti: 0', exact: true });
      await expect(tile).toBeVisible();
      await phone.evaluate(async () => {
        await document.fonts.ready;
      });
      await expect(phone).toHaveScreenshot('deck-example.png', { animations: 'disabled', scale: 'css' });
      await tile.click();
      await expect(phone.getByRole('button', { name: 'Esempio: Saluti: 1', exact: true })).toBeVisible();
      await expect(
        page.getByRole('region', { name: 'Esempio', exact: true }).getByText('1', { exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Saluta', exact: true }).click();
      await expect(phone.getByRole('button', { name: 'Esempio: Saluti: 2', exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('an example row in Sistema sits in Questo PC after Webcam and before Alimentazione', async ({ page }) => {
    // The uptime figure moves with the run; the baseline pins it like the other visual specs.
    await page.route('**/trpc/health*', (route) =>
      route.fulfill({ json: [{ result: { data: { ok: true, uptime: 42 } } }] }),
    );
    await page.goto('/desk/system');
    const pc = page.getByRole('region', { name: 'Questo PC' });
    const rows = pc.getByRole('group');
    await expect(rows.last()).toHaveAccessibleName('Alimentazione');
    const names = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label') ?? node.tagName),
    );
    const example = names.indexOf('Esempio');
    expect(example).toBeGreaterThan(names.indexOf('Webcam'));
    // The holds' fieldset is named by its legend, so it has no aria-label and is the last group.
    expect(example).toBeLessThan(names.length - 1);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.mouse.move(0, 0);
    // The example row counts greetings other specs change, so its state line is masked.
    await expect(page).toHaveScreenshot('desk-system-example.png', {
      animations: 'disabled',
      mask: [pc.getByRole('group', { name: 'Esempio' }).locator('p')],
    });
  });

  test('the example module puts one row in the Dispositivi list of this PC', async ({ page, request }) => {
    await page.goto('/desk/devices');
    const row = page.getByRole('region', { name: 'Collegati a questo PC' }).getByRole('group', { name: 'Esempio' });
    const count = row.getByRole('paragraph');
    await expect(count).toHaveText(/^Saluti: \d+$/);
    // The greeting count is the module's own state and other tests raise it, so read it from the server.
    const before = (await (await request.get('/trpc/hello.state')).json()).result.data.count;
    await expect(count).toHaveText(`Saluti: ${before}`);
    await row.getByRole('button', { name: 'Saluta', exact: true }).click();
    await expect(count).toHaveText(`Saluti: ${before + 1}`);
  });

  test('the example widget is offered in Panoramica, where its size is chosen and saved', async ({ page }) => {
    await page.goto('/desk');
    await page.getByRole('button', { name: 'Modifica', exact: true }).click();
    const saved = () => page.waitForResponse((res) => res.url().includes('/trpc/layout.save') && res.ok());
    // Adding and resizing each save the board: wait for each, or a reload can come before the second one.
    const added = saved();
    await page.getByRole('button', { name: 'Aggiungi Esempio', exact: true }).click();
    await added;
    // The size radios are visually hidden inside their labels: click the label, as widgets.spec.ts does.
    const resized = saved();
    await page
      .getByRole('group', { name: 'Dimensione di Esempio' })
      .locator('label', { has: page.getByRole('radio', { name: 'Grande', exact: true }) })
      .click();
    await resized;
    await page.reload();
    await expect(page.locator('[data-widget="hello"]')).toHaveAttribute('data-size', 'large');
    await page.getByRole('button', { name: 'Modifica', exact: true }).click();
    await page.getByRole('button', { name: 'Ripristina', exact: true }).click();
    await expect(page.locator('[data-widget="hello"]')).toHaveCount(0);
  });

  test('the Lavoro zone appears because the example adds a section, and Messaggi does not', async ({ page }) => {
    await page.route('**/trpc/mail.accounts*', (route) => route.fulfill({ status: 404, body: '{}' }));
    await page.goto('/desk');
    await rail(page).getByRole('link', { name: 'Lavoro', exact: true }).click();
    await expect(page).toHaveURL(/\/desk\/lavoro$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Lavoro' })).toBeVisible();
    await expect(page.getByText('Ciao dal modulo di esempio', { exact: true })).toBeVisible();
    // Its page is only the sections modules add: one section, so no tab bar.
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(rail(page).getByRole('link', { name: 'Messaggi', exact: true })).toHaveCount(0);
    await page.goto('/desk/messaggi');
    await expect(page.getByText('Pagina non trovata')).toBeVisible();
  });
} else {
  test('example UI and actions are absent without the flag', async ({ page, request }) => {
    await page.goto('/desk/devices');
    await expect(page.getByRole('region', { name: 'Collegati a questo PC' })).toHaveCount(0);
    await page.goto('/desk');
    await expect(rail(page).getByRole('link', { name: 'Esempio', exact: true })).toHaveCount(0);
    expect((await request.get('/trpc/hello.state')).status()).toBe(404);
  });

  test('without sections Lavoro and Messaggi have no rail entry and no page', async ({ page }) => {
    await page.route('**/trpc/mail.accounts*', (route) => route.fulfill({ status: 404, body: '{}' }));
    await page.goto('/desk');
    await expect(rail(page).getByRole('link', { name: 'Panoramica', exact: true })).toBeVisible();
    for (const name of ['Lavoro', 'Messaggi'])
      await expect(rail(page).getByRole('link', { name, exact: true })).toHaveCount(0);
    for (const path of ['/desk/lavoro', '/desk/messaggi']) {
      await page.goto(path);
      await expect(page.getByText('Pagina non trovata')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toHaveCount(0);
    }
  });
}
