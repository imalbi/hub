import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { restoreDesktop } from './desktop.ts';
import { SERVER_URL } from './hosts.ts';
import { contrastRatio } from './contrast.ts';
import { themeSettled } from './themes.ts';

const examples = process.env.HUB_EXAMPLE_MODULES === '1';

test('the rail button opens the palette, says Ctrl K under it and Escape returns focus to it', async ({ page }) => {
  await page.goto('/desk/media');
  const rail = page.getByRole('navigation', { name: 'Zone' });
  const trigger = rail.getByRole('button', { name: 'Cerca o esegui, scorciatoia Ctrl K' });
  await expect(rail.getByText('Ctrl K', { exact: true })).toBeVisible();
  await trigger.click();
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole('combobox', { name: 'Cerca azioni' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('query tools stay out of the command palette', async ({ page, pc }) => {
  const registry = (await (await pc.get('/trpc/registry.list')).json()).result.data;
  expect(
    registry.some((item: { path: string; kind: string }) => item.path === 'jobs.output' && item.kind === 'query'),
  ).toBe(true);
  await page.goto('/desk');
  await page.getByRole('button', { name: 'Cerca o esegui, scorciatoia Ctrl K' }).click();
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await palette.getByRole('combobox').fill('Leggi output job');
  await expect(palette.getByRole('status')).toContainText('Nessun risultato');
  await expect(palette.getByRole('option', { name: /Leggi output job/ })).toHaveCount(0);
});

test.afterEach(async ({ pc, request }) => {
  await restoreDesktop(pc);
  if (examples) await request.post(`${SERVER_URL}/__fake/hue`, { data: { reset: true } });
});

test('Ctrl+K searches the registry, arrows and Enter run an action and Escape restores focus', async ({ page, pc }) => {
  await page.goto('/desk');
  await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toBeVisible();
  const origin = page.getByRole('button', { name: 'Modifica', exact: true });
  await origin.focus();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await expect(palette).toBeVisible();
  const search = palette.getByRole('combobox', { name: 'Cerca azioni' });
  await expect(search).toBeFocused();
  await expect(palette.getByRole('option', { name: /Avvia Pomodoro/ })).toBeVisible();
  const total = await palette.getByRole('option').count();
  const initial = await palette.getByRole('option', { selected: true }).getAttribute('id');
  await expect(search).toHaveAttribute('aria-activedescendant', initial ?? '');
  await search.fill('trcc');
  await expect.poll(() => palette.getByRole('option').count()).toBeLessThan(total);
  await expect(palette.getByRole('option', { name: /Traccia successiva/ })).toBeVisible();
  await expect(palette.getByRole('option', { name: /Traccia precedente/ })).toBeVisible();
  await expect(palette.locator('svg[data-icon="magnifying-glass"]')).toBeVisible();
  const active = await palette.getByRole('option', { selected: true }).getAttribute('id');
  await expect(search).toHaveAttribute('aria-activedescendant', active ?? '');
  await page.keyboard.press('ArrowDown');
  await expect(search).not.toHaveAttribute('aria-activedescendant', active ?? '');
  await page.keyboard.press('ArrowUp');
  await expect(search).toHaveAttribute('aria-activedescendant', active ?? '');
  await search.fill('');
  await expect(palette.getByRole('option')).toHaveCount(total);
  const cleared = await palette.getByRole('option', { selected: true }).getAttribute('id');
  await expect(search).toHaveAttribute('aria-activedescendant', cleared ?? '');
  await search.fill('Toggle play/pause');
  await page.keyboard.press('Enter');
  await expect.poll(async () => await (await pc.get('/trpc/media.state')).text()).toContain('Paused');
  await expect(palette).not.toBeVisible();
  await expect(origin).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(palette.getByRole('group', { name: 'Azioni' }).getByRole('option').first()).toContainText(
    'Riproduci o metti in pausa',
  );
  await search.fill('nessuna-corrispondenza');
  await expect(palette.getByRole('status')).toContainText('Nessun risultato');
  await expect(search).not.toHaveAttribute('aria-activedescendant');
  await page.keyboard.press('Escape');
  await expect(palette).not.toBeVisible();
});

test('schema forms reject empty input, submit valid values and show generic failures', async ({ page, pc }) => {
  await page.goto('/desk');
  await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await palette.getByRole('combobox').fill('Seleziona uscita audio');
  await expect(palette.getByRole('option', { name: /Seleziona uscita audio/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await palette.getByRole('button', { name: 'Esegui', exact: true }).click();
  expect(
    await palette.getByLabel('label', { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valid),
  ).toBe(false);
  await palette.getByLabel('label', { exact: true }).fill('Casse');
  await palette.getByRole('button', { name: 'Esegui', exact: true }).click();
  await expect(palette.getByRole('status')).toHaveText('Fatto');
  await expect
    .poll(async () => await (await pc.get('/trpc/audio.state')).text())
    .toContain('"current":{"label":"Casse"}');
  await palette.getByLabel('label', { exact: true }).fill('Inesistente');
  await palette.getByRole('button', { name: 'Esegui', exact: true }).click();
  await expect(palette.getByRole('status')).toHaveText('Azione non riuscita. Riprova.');
  await expect(palette).not.toContainText('No configured output');
  // The field was disabled while the request ran, so focus is on the page: Escape still goes back, then closes.
  await page.keyboard.press('Escape');
  await expect(palette.getByRole('option', { name: /Seleziona uscita audio/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).not.toBeVisible();
});

test('danger needs a hold', async ({ page }) => {
  await page.goto('/desk');
  await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await palette.getByRole('combobox').fill('Spegni PC');
  await expect(palette.getByRole('option', { name: /Spegni PC/ })).toBeVisible();
  await page.keyboard.press('Enter');
  const hold = palette.getByRole('button', { name: 'Tieni premuto per Spegni PC' });
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('system.powerOff')) calls.push(request.postData() ?? '');
  });
  await expect(hold).toBeVisible();
  await page.clock.install();
  await hold.click();
  await page.clock.runFor(1000);
  expect(calls).toEqual([]);
  await hold.hover();
  await page.mouse.down();
  await page.clock.runFor(900);
  await page.mouse.up();
  await expect(hold).toContainText('Fatto');
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain('"confirmed":true');
  // Escape leaves the page first (the list is back, the search editable), a second one closes.
  await page.keyboard.press('Escape');
  await expect(palette.getByRole('option', { name: /Spegni PC/ })).toBeVisible();
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).not.toBeVisible();
});

// Step 64 reverses step 24 on purpose: an action whose schema the palette cannot draw has no way to run from there, so it is not listed.
test('an action with an unsupported schema is not listed, and no row says it cannot run', async ({ page }) => {
  await page.goto('/desk');
  await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await expect(palette.getByRole('option', { name: /Avvia Pomodoro/ })).toBeVisible();
  await expect(palette.getByRole('option', { name: /Salva disposizione widget/ })).toHaveCount(0);
  await expect(palette.getByText('Dati non supportati')).toHaveCount(0);
  await palette.getByRole('combobox').fill('Salva disposizione widget');
  await expect(palette.getByRole('status')).toContainText('Nessun risultato');
  await expect(palette.getByRole('option', { name: /Salva disposizione widget/ })).toHaveCount(0);
});

test('a schema enum offers the registered workspace values and submits one valid value', async ({ page }) => {
  await page.goto('/desk');
  await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await palette.getByRole('combobox').fill('Apri spazio di lavoro');
  await expect(palette.getByRole('option', { name: /Apri spazio di lavoro/ })).toBeVisible();
  await page.keyboard.press('Enter');
  // A required choice left empty does not run the action.
  let ran = false;
  page.on('request', (request) => {
    if (request.url().includes('system.toggleWorkspace')) ran = true;
  });
  await palette.getByRole('button', { name: 'Esegui', exact: true }).click();
  await expect(palette.getByText('Scelta obbligatoria')).toBeVisible();
  expect(ran).toBe(false);
  // The list is a Select inside the modal dialog, so it must be reachable from the dialog itself.
  await palette.getByRole('button', { name: 'name: Scegli un valore', exact: true }).click();
  const names = palette.getByRole('listbox', { name: 'name' });
  await expect(names.getByRole('option')).toHaveText(['communication', 'music', 'hub']);
  await names.getByRole('option', { name: 'music' }).click();
  await expect(palette.getByRole('button', { name: 'name: music', exact: true })).toBeVisible();
  const sent = page.waitForRequest((request) => request.url().includes('system.toggleWorkspace'));
  await palette.getByRole('button', { name: 'Esegui', exact: true }).click();
  expect((await sent).postData()).toContain('"name":"music"');
  await expect(palette.getByRole('status')).toHaveText('Fatto');
});

const pill = (page: Page) => page.getByRole('button', { name: 'Cerca o esegui, scorciatoia Ctrl K' });

test('the trigger sits in the rail on every desk zone and the palette opens centred near the top', async ({ page }) => {
  const view = page.viewportSize();
  if (!view) throw new Error('no viewport');
  for (const path of ['/desk', '/desk/studio', '/desk/settings']) {
    await page.goto(path);
    const box = await pill(page).boundingBox();
    const rail = await page.getByRole('navigation', { name: 'Zone' }).boundingBox();
    if (!box || !rail) throw new Error('missing box');
    expect(box.x).toBeGreaterThanOrEqual(rail.x);
    expect(box.x + box.width).toBeLessThanOrEqual(rail.x + rail.width);
    await pill(page).click();
    await expect(page.getByRole('option', { name: /Avvia Pomodoro/ })).toBeVisible();
    await expect
      .poll(async () => {
        const field = await page.getByRole('dialog', { name: 'Comandi' }).locator('input').boundingBox();
        return field ? Math.abs(field.x + field.width / 2 - view.width / 2) : Infinity;
      })
      .toBeLessThan(view.width * 0.1);
    await page.keyboard.press('Escape');
  }
});

for (const size of [
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
])
  for (const theme of ['ink', 'paper']) {
    test(`the trigger icon is readable and the open palette fits the screen: ${theme} at ${size.width}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.addInitScript((id) => localStorage.setItem('hub.theme', id), theme);
      await page.goto('/desk');
      await expect(pill(page)).toBeVisible();
      await themeSettled(page);
      expect(await contrastRatio(pill(page))).toBeGreaterThanOrEqual(4.5);
      await pill(page).click();
      const field = page.getByRole('dialog', { name: 'Comandi' }).getByRole('combobox');
      await expect(field).toBeFocused();
      // Wait for the grow to finish: the list shows every row and the panel stops moving.
      await expect(page.getByRole('option', { name: /Avvia Pomodoro/ })).toBeVisible();
      await expect
        .poll(async () => {
          const box = await page.getByRole('dialog', { name: 'Comandi' }).locator('input').boundingBox();
          return box ? box.width : 0;
        })
        .toBeGreaterThan(size.width * 0.1);
      // The list scrolls inside the panel, so the field and the first row stand for "not clipped".
      const first = page.getByRole('group', { name: 'Vai a' }).getByRole('option').first();
      for (const box of [await field.boundingBox(), await first.boundingBox()]) {
        if (!box) throw new Error('missing box');
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      }
      expect(await contrastRatio(first)).toBeGreaterThanOrEqual(4.5);
    });
  }

test('the pill and Ctrl+K open the palette, Escape closes it and focus returns to the pill', async ({ page }) => {
  await page.goto('/desk');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await expect(pill(page)).toBeVisible();
  await pill(page).click();
  await expect(palette).toBeVisible();
  await expect(palette.getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette).not.toBeVisible();
  await expect(pill(page)).toBeFocused();
  await pill(page).focus();
  await page.keyboard.press('Control+k');
  await expect(palette).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(palette).not.toBeVisible();
  await expect(pill(page)).toBeFocused();
});

test('a click outside the palette closes it, a click inside does not', async ({ page }) => {
  await page.goto('/desk');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await pill(page).click();
  await expect(palette.getByRole('combobox')).toBeVisible();
  await palette.getByRole('combobox').click();
  await expect(palette.getByRole('combobox')).toBeVisible();
  // The bottom left corner is veil: the palette hangs from the top center.
  await page.mouse.click(10, (page.viewportSize()?.height ?? 600) - 10);
  await expect(palette).not.toBeVisible();
});

test('opening grows the palette out of the pill, and with reduced motion it just appears', async ({ page }) => {
  // Animations running inside the dialog a few frames after the click (the grow is a set of CSS transitions).
  const running = () =>
    page.evaluate(async () => {
      document.querySelector<HTMLElement>('button[aria-haspopup="dialog"]')?.click();
      for (let frame = 0; frame < 4; frame++) await new Promise((resolve) => requestAnimationFrame(resolve));
      return document.querySelector('dialog')?.getAnimations({ subtree: true }).length ?? -1;
    });
  await page.goto('/desk');
  await expect(pill(page)).toBeVisible();
  expect(await running()).toBeGreaterThan(0);
  await expect(page.getByRole('dialog', { name: 'Comandi' }).getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await running()).toBe(0);
  // The page change is a script animation, which the global reduced-motion CSS does not reach: the component itself must skip it.
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await palette.getByRole('combobox').fill('Seleziona uscita audio');
  await expect(palette.getByRole('option', { name: /Seleziona uscita audio/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(palette.getByLabel('label', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('dialog')?.getAnimations({ subtree: true }).length)).toBe(0);
});

test('a loading registry and a failing one are announced in the list', async ({ page }) => {
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  // The registry is asked in a batch with other queries, so match it anywhere in the path.
  await page.route('**/trpc/*registry.list*', async (route) => {
    await held;
    await route.fulfill({
      status: 500,
      json: [{ error: { message: 'boom', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR' } } }],
    });
  });
  try {
    await page.goto('/desk');
    await expect(pill(page)).toBeVisible();
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Comandi' });
    await palette.getByRole('combobox').fill('zzzz');
    await expect(palette.getByRole('status')).toContainText('Caricamento azioni');
    release?.();
    // The query retries with a back-off before it gives up.
    await expect(palette.getByRole('status')).toContainText('Azione non riuscita. Riprova.', { timeout: 20_000 });
    await expect(palette).not.toContainText('boom');
  } finally {
    release?.();
  }
});

test('a failing action shows the generic error and keeps the palette open', async ({ page }) => {
  await page.route('**/trpc/news.refresh*', (route) =>
    route.fulfill({
      status: 500,
      json: [{ error: { message: 'secret detail', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR' } } }],
    }),
  );
  await page.goto('/desk');
  await expect(pill(page)).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await palette.getByRole('combobox').fill('Aggiorna notizie');
  await expect(palette.getByRole('option', { name: /Aggiorna notizie/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(palette.getByText('Azione non riuscita. Riprova.')).toBeVisible();
  await expect(palette).not.toContainText('secret detail');
  await expect(palette.getByRole('combobox')).toBeVisible();
});

test('Backspace on an empty search leaves an action form for the list', async ({ page }) => {
  await page.goto('/desk');
  await expect(pill(page)).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await palette.getByRole('combobox').fill('Seleziona uscita audio');
  await expect(palette.getByRole('option', { name: /Seleziona uscita audio/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(palette.getByLabel('label', { exact: true })).toBeFocused();
  await palette.getByRole('combobox').focus();
  await page.keyboard.press('Backspace');
  await expect(palette.getByLabel('label', { exact: true })).toHaveCount(0);
  await expect(palette.getByRole('option', { name: /Seleziona uscita audio/ })).toBeVisible();
});

test('Vai a lists the rail zones above the actions and navigates', async ({ page }) => {
  await page.goto('/desk');
  await expect(pill(page)).toBeVisible();
  // A full page load would drop this marker.
  await page.evaluate(() => Object.assign(window, { navigationMarker: true }));
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  const goto = palette.getByRole('group', { name: 'Vai a' });
  const names = ['Panoramica', 'Studio', 'Media', 'Sistema', 'Dispositivi'];
  if (examples) names.push('Lavoro');
  names.push('Messaggi', 'Calendario');
  if (examples) names.push('Esempio');
  names.push('Impostazioni');
  await expect(goto.getByRole('option')).toHaveText(names);
  const first = await goto.getByRole('option').first().boundingBox();
  const action = await palette.getByRole('group', { name: 'Azioni' }).getByRole('option').first().boundingBox();
  expect(first?.y).toBeLessThan(action?.y ?? 0);
  await palette.getByRole('combobox').fill('Impostazioni');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/desk\/settings\/appearance$/);
  await expect(palette).not.toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Impostazioni' })).toBeVisible();
  expect(await page.evaluate(() => 'navigationMarker' in window)).toBe(true);
});

if (examples)
  test('example Hue range and boolean forms run through registry discovery', async ({ page, request }) => {
    await page.goto('/desk');
    await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toBeVisible();
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Comandi' });
    await palette.getByRole('combobox').fill('Regola luminosità');
    await expect(palette.getByRole('option', { name: /Regola luminosità/ })).toBeVisible();
    await page.keyboard.press('Enter');
    const percent = palette.getByLabel('percent', { exact: true });
    await percent.fill('101');
    await palette.getByRole('button', { name: 'Esegui', exact: true }).click();
    expect((await (await request.get(`${SERVER_URL}/__fake/hue`)).json()).writes).toEqual([]);
    await percent.fill('42');
    await palette.getByRole('button', { name: 'Esegui', exact: true }).click();
    await expect(palette.getByRole('status')).toHaveText('Fatto');
    await expect
      .poll(async () => (await (await request.get(`${SERVER_URL}/__fake/hue`)).json()).writes)
      .toEqual([{ type: 'setBrightness', percent: 42 }]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(palette).not.toBeVisible();
    await page.keyboard.press('Control+k');
    await palette.getByRole('combobox').fill('Imposta luce');
    await expect(palette.getByRole('option', { name: /Imposta luce/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await palette.getByRole('button', { name: 'on: Scegli un valore', exact: true }).click();
    await palette.getByRole('listbox', { name: 'on' }).getByRole('option', { name: 'No', exact: true }).click();
    await palette.getByRole('button', { name: 'Esegui', exact: true }).click();
    await expect(palette.getByRole('status')).toHaveText('Fatto');
    await expect
      .poll(async () => (await (await request.get(`${SERVER_URL}/__fake/hue`)).json()).writes)
      .toEqual([
        { type: 'setBrightness', percent: 42 },
        { type: 'setPower', on: false },
      ]);
  });

// Step 64, P1 and the server cut: the example module's greetings, found by two characters.
test('two characters find the example greetings under Saluti, one character finds none, and 5 matches show 3 rows', async ({
  page,
}) => {
  test.skip(!examples, 'the greetings are the example module');
  await page.goto('/desk');
  await expect(pill(page)).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  const field = palette.getByRole('combobox');
  const saluti = palette.getByRole('group', { name: /Saluti/ });
  await expect(field).toBeFocused();
  await field.fill('b');
  // Past the 150 ms delay: no request is made for one character, so no group can appear.
  await page.waitForTimeout(400);
  await expect(saluti).toHaveCount(0);
  await field.fill('bu');
  await expect(saluti.getByRole('option')).toHaveCount(2);
  await expect(saluti).toContainText('2');
  await expect(saluti.getByRole('option').first()).toContainText('Buongiorno dal modulo');
  await field.fill('b');
  await expect(saluti).toHaveCount(0);
  // Five greetings start with "Ciao": three rows, the count says 5.
  await field.fill('ci');
  await expect(saluti.getByRole('option')).toHaveCount(3);
  await expect(saluti).toContainText('5');
  await expect(saluti.getByRole('button')).toHaveCount(0);
});

test('assistant is absent when off and appears last for two words, then runs an audio action', async ({ page, pc }) => {
  await page.goto('/desk');
  await page.getByRole('button', { name: 'Cerca o esegui, scorciatoia Ctrl K' }).click();
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  const field = palette.getByRole('combobox');
  await field.fill('metti le cuffie');
  await expect(palette.getByRole('option', { name: /Chiedi a Hub/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await pc.post(`${SERVER_URL}/__fake/assistant`, { data: { enabled: true } });
  try {
    await page.reload();
    await pc.post('/trpc/audio.setOutput', { data: { label: 'Casse' } });
    await page.getByRole('button', { name: 'Cerca o esegui, scorciatoia Ctrl K' }).click();
    await field.fill('cuffie');
    await expect(palette.getByRole('option', { name: /Chiedi a Hub/ })).toHaveCount(0);
    await field.fill('metti le cuffie');
    const option = palette.getByRole('option', { name: 'Chiedi a Hub: «metti le cuffie»' });
    await expect(option).toBeVisible();
    await expect(palette.getByRole('option').last()).toHaveText(/Chiedi a Hub/);
    await expect(palette.getByRole('group').last()).toHaveAccessibleName('Assistente');
    await page.keyboard.press('Enter');
    await expect(palette.getByText('Seleziona uscita audio · fatto')).toBeVisible();
    await expect
      .poll(async () => await (await pc.get('/trpc/audio.state')).text())
      .toContain('"current":{"label":"Cuffie"}');
  } finally {
    await pc.post(`${SERVER_URL}/__fake/assistant`, { data: { enabled: false } });
  }
});

test('assistant danger action requires the hold dialog', async ({ page, pc }) => {
  await pc.post(`${SERVER_URL}/__fake/assistant`, { data: { enabled: true } });
  try {
    await page.goto('/desk');
    await page.getByRole('button', { name: 'Cerca o esegui, scorciatoia Ctrl K' }).click();
    const palette = page.getByRole('dialog', { name: 'Comandi' });
    await palette.getByRole('combobox').fill('spegni il pc');
    await palette.getByRole('option', { name: 'Chiedi a Hub: «spegni il pc»' }).click();
    const confirmation = page.getByRole('dialog', { name: 'Richiesta di conferma' });
    await expect(confirmation).toBeVisible();
    await expect(palette.getByText('Spegni PC · conferma con la pressione')).toBeVisible();
    const system = await (await pc.get(`${SERVER_URL}/__fake/system`)).json();
    expect(system.calls).not.toContain('systemctl poweroff');
    await confirmation.getByRole('button', { name: 'Rifiuta' }).click();
  } finally {
    await pc.post(`${SERVER_URL}/__fake/assistant`, { data: { enabled: false } });
  }
});
