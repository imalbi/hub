import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { answerQueries } from './desktop.ts';
import { DECK_STATE, PHONE_URL } from './hosts.ts';
import { freezePomodoro } from './pomodoro-visual.ts';

const rail = (page: Page) => page.getByRole('navigation', { name: 'Zone' });

if (process.env.HUB_EXAMPLE_MODULES === '1') {
  test('example mark follows module availability', async ({ page }) => {
    await page.goto('/desk');
    await expect(page.locator('[data-day-ruler]').getByText(/12:45.*Ciao dal modulo di esempio/)).toHaveCount(1);
    await answerQueries(page, { 'modules.enabled': [] });
    await page.reload();
    await expect(page.locator('[data-day-ruler]').getByText(/12:45.*Ciao dal modulo di esempio/)).toHaveCount(0);
  });
  test('a greeting captures its post-it and shows its link', async ({ page, pc }) => {
    try {
      await page.setViewportSize({ width: 3840, height: 2160 });
      // In the evening the capture card starts on Domani, and the post-it would leave Oggi: pin the morning.
      const morning = new Date();
      morning.setHours(10, 0, 0, 0);
      await page.clock.install({ time: morning });
      await pc.post('/trpc/notes.add', {
        data: { text: 'Altro saluto', about: { source: 'hello-greetings', id: '2', title: 'Ciao a tutti' } },
      });
      await page.goto('/desk/hello');
      await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
      const capture = page.getByRole('dialog', { name: 'Nuovo post-it' });
      await expect(capture.getByText('Riguarda: Ciao dal modulo di esempio')).toBeVisible();
      await expect(capture.locator('[data-modal-panel]')).toHaveCSS('opacity', '1');
      await capture.getByRole('textbox', { name: 'Testo del post-it' }).fill('Promemoria saluto');
      await page.keyboard.press('Enter');
      await expect(capture).toHaveCount(0);
      await expect(page.getByText('Promemoria saluto')).toBeVisible();
      await expect(page.getByText('Altro saluto')).toHaveCount(0);
      await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
      await capture.getByRole('button', { name: /Rimuovi.*Riguarda/ }).click();
      await capture.getByRole('textbox', { name: 'Testo del post-it' }).fill('Senza riferimento');
      await page.keyboard.press('Enter');
      await expect(capture).toHaveCount(0);
      await pc.post('/trpc/layout.save', {
        data: {
          zone: 'overview',
          items: [
            { widget: 'today', size: 'wide', x: 0, y: 0 },
            { widget: 'notes', size: 'wide', x: 0, y: 1 },
          ],
        },
      });
      await page.goto('/desk');
      const widget = page.getByRole('region', { name: 'Post-it', exact: true });
      const card = widget.locator('li').filter({ hasText: 'Promemoria saluto' });
      await expect(card.getByRole('link', { name: 'Ciao dal modulo di esempio' })).toBeVisible();
      const unrelated = widget.locator('li').filter({ hasText: 'Senza riferimento' });
      await expect(unrelated).toBeVisible();
      await expect(unrelated.getByRole('link')).toHaveCount(0);
      await unrelated
        .getByRole('button', { name: /Senza riferimento/ })
        .last()
        .click();
      await expect(unrelated).toHaveCount(0);
      // Oggi Largo with two post-its about a record: a caption on its own line overflowed the cell (step 71 review).
      const todayPanel = page.locator('[data-widget="today"] [data-panel]').first();
      await expect(todayPanel.getByRole('link', { name: 'Ciao a tutti' })).toBeVisible();
      await expect(todayPanel.getByRole('link', { name: 'Ciao dal modulo di esempio', exact: true })).toBeVisible();
      expect(
        await todayPanel.evaluate((element) => element.scrollHeight <= element.clientHeight),
        'Oggi fits its cell',
      ).toBe(true);
      await card.getByRole('link', { name: 'Ciao dal modulo di esempio' }).click();
      await expect(page).toHaveURL(/\/desk\/hello$/);
    } finally {
      const result = await pc.get('/trpc/notes.open');
      const notes: Array<{ id: string; text: string }> = (await result.json()).result.data;
      for (const note of notes.filter((entry) =>
        ['Promemoria saluto', 'Senza riferimento', 'Altro saluto'].includes(entry.text),
      ))
        await pc.post('/trpc/notes.remove', { data: { id: note.id } });
      await pc.post('/trpc/layout.reset', { data: { zone: 'overview' } });
    }
  });
  test('example module adds a zone page, a configurable widget and a synchronized deck tile', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await freezePomodoro(page);
    await answerQueries(page, { health: { ok: true, uptime: 42 } });
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
    // The uptime figure moves with the run; the baseline pins it like the other visual specs. Through answerQueries:
    // the Backup row's query can lead the batch health travels in, which a glob on health misses.
    await answerQueries(page, { health: { ok: true, uptime: 42 } });
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
    await expect(page.locator('[data-widget="hello"] [data-readout]')).toHaveCSS('font-family', /JetBrains Mono/);
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
