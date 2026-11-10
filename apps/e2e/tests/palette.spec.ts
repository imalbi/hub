import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { restoreDesktop } from './desktop.ts';
import { SERVER_URL } from './hosts.ts';

const examples = process.env.HUB_EXAMPLE_MODULES === '1';

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
  await expect(palette.getByRole('listbox')).toHaveAttribute('aria-activedescendant', initial ?? '');
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
});

test('danger needs a hold and unsupported schemas remain listed without a run control', async ({ page }) => {
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
  await page.keyboard.press('Escape');
  await expect(palette).not.toBeVisible();
  await page.keyboard.press('Control+k');
  await palette.getByRole('combobox').fill('Salva disposizione widget');
  await expect(palette.getByRole('option', { name: /Salva disposizione widget/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(palette.getByText('Questa azione richiede dati non supportati dalla palette.')).toBeVisible();
  await expect(palette.getByRole('button', { name: 'Esegui', exact: true })).toHaveCount(0);
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

const button = (page: Page) => page.getByRole('button', { name: 'Cerca o esegui, scorciatoia Ctrl K' });

test('at rest the palette is a round button at the bottom right of every desk page', async ({ page }) => {
  for (const path of ['/desk', '/desk/studio', '/desk/settings']) {
    await page.goto(path);
    const box = await button(page).boundingBox();
    const view = page.viewportSize();
    if (!box || !view) throw new Error('missing box');
    expect(box.x + box.width).toBeGreaterThan(view.width * 0.9);
    expect(box.y + box.height).toBeGreaterThan(view.height * 0.9);
    expect(box.width).toBeCloseTo(box.height, 0);
    await expect(button(page)).toHaveCSS('border-radius', /^\d+(\.\d+)?px$/);
  }
});

test('the button and Ctrl+K open the palette at the bottom center and Escape returns focus to the button', async ({
  page,
}) => {
  await page.goto('/desk');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  const view = page.viewportSize();
  if (!view) throw new Error('no viewport');
  for (const open of [() => button(page).click(), () => page.keyboard.press('Control+k')]) {
    await open();
    await expect(palette).toBeVisible();
    // The entrance travels for a moment; the resting place is the bottom center.
    await expect
      .poll(async () => {
        const box = await palette.boundingBox();
        return box ? Math.round(Math.abs(box.x + box.width / 2 - view.width / 2)) : -1;
      })
      .toBe(0);
    const box = await palette.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(view.height * 0.9);
    await page.keyboard.press('Escape');
    await expect(palette).not.toBeVisible();
    await expect(button(page)).toBeFocused();
  }
});

test('a click outside the palette closes it, a click inside does not', async ({ page }) => {
  await page.goto('/desk');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  await button(page).click();
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox').click();
  await expect(palette).toBeVisible();
  // The top left corner is backdrop: the palette sits at the bottom center.
  await page.mouse.click(10, 10);
  await expect(palette).not.toBeVisible();
});

test('opening grows the palette out of the button, and with reduced motion it just appears', async ({ page }) => {
  const opening = () =>
    page.evaluate(async () => {
      document.getElementById('palette-button')?.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return document.querySelector('dialog')?.getAnimations().length ?? -1;
    });
  const closing = () =>
    page.evaluate(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return document.querySelector('dialog')?.getAnimations().length ?? -1;
    });
  await page.goto('/desk');
  await expect(button(page)).toBeVisible();
  expect(await opening()).toBeGreaterThan(0);
  expect(await closing()).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).not.toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await opening()).toBe(0);
});

test('Vai a lists the rail zones above the actions and navigates', async ({ page }) => {
  await page.goto('/desk');
  await expect(button(page)).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandi' });
  const goto = palette.getByRole('group', { name: 'Vai a' });
  const names = ['Panoramica', 'Studio', 'Media', 'Sistema', 'Dispositivi'];
  if (examples) names.push('Lavoro');
  names.push('Messaggi');
  if (examples) names.push('Esempio');
  names.push('Impostazioni');
  await expect(goto.getByRole('option')).toHaveText(names);
  const first = await goto.getByRole('option').first().boundingBox();
  const action = await palette.getByRole('group', { name: 'Azioni' }).getByRole('option').first().boundingBox();
  expect(first?.y).toBeLessThan(action?.y ?? 0);
  await palette.getByRole('combobox').fill('Impostazioni');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/desk\/settings$/);
  await expect(palette).not.toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Impostazioni' })).toBeVisible();
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
