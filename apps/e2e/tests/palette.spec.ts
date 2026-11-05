import { expect, test } from './fixtures.ts';
import { restoreDesktop } from './desktop.ts';

const examples = process.env.HUB_EXAMPLE_MODULES === '1';

test.afterEach(async ({ pc, request }) => {
  await restoreDesktop(pc);
  if (examples) await request.post('http://127.0.0.1:4190/__fake/hue', { data: { reset: true } });
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
  await expect(palette.getByRole('option').first()).toContainText('Riproduci o metti in pausa');
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
  const name = palette.getByRole('combobox', { name: 'name', exact: true });
  await expect(name.getByRole('option', { includeHidden: true })).toHaveText([
    'Scegli un valore',
    'communication',
    'music',
  ]);
  await name.selectOption('music');
  const sent = page.waitForRequest((request) => request.url().includes('system.toggleWorkspace'));
  await palette.getByRole('button', { name: 'Esegui', exact: true }).click();
  expect((await sent).postData()).toContain('"name":"music"');
  await expect(palette.getByRole('status')).toHaveText('Fatto');
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
    expect((await (await request.get('http://127.0.0.1:4190/__fake/hue')).json()).writes).toEqual([]);
    await percent.fill('42');
    await palette.getByRole('button', { name: 'Esegui', exact: true }).click();
    await expect(palette.getByRole('status')).toHaveText('Fatto');
    await expect
      .poll(async () => (await (await request.get('http://127.0.0.1:4190/__fake/hue')).json()).writes)
      .toEqual([{ type: 'setBrightness', percent: 42 }]);
    await page.keyboard.press('Escape');
    await expect(palette).not.toBeVisible();
    await page.keyboard.press('Control+k');
    await palette.getByRole('combobox').fill('Imposta luce');
    await expect(palette.getByRole('option', { name: /Imposta luce/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await palette.getByRole('combobox', { name: 'on', exact: true }).selectOption('false');
    await palette.getByRole('button', { name: 'Esegui', exact: true }).click();
    await expect(palette.getByRole('status')).toHaveText('Fatto');
    await expect
      .poll(async () => (await (await request.get('http://127.0.0.1:4190/__fake/hue')).json()).writes)
      .toEqual([
        { type: 'setBrightness', percent: 42 },
        { type: 'setPower', on: false },
      ]);
  });
