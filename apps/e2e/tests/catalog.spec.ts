import { expect, test } from './fixtures.ts';
import { CATALOG_URL, catalogControl, catalogState, cleanCatalog, hold } from './catalog.ts';
import { pairDevice, revokeDevices } from './desktop.ts';

test.beforeEach(async ({ pc }) => cleanCatalog(pc));
test.afterEach(async ({ page, pc }) => {
  await page.unrouteAll({ behavior: 'wait' });
  await page.close();
  await cleanCatalog(pc);
});

test('catalog validates URLs, requires a hold, updates and removes modules before their source', async ({
  page,
  pc,
}) => {
  await page.goto('/desk/settings');
  await page.getByRole('link', { name: 'Catalogo', exact: true }).click();
  await expect(page.getByText('Nessun repository', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'URL repository' }).fill('file:///fake-repository');
  await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await expect(page.getByText('Inserisci un URL Git HTTPS o SSH valido.')).toBeVisible();
  await page.getByRole('textbox', { name: 'URL repository' }).fill(CATALOG_URL);
  await page.getByRole('button', { name: 'Riprova', exact: true }).click();
  const source = page.getByRole('region', { name: 'Catalogo esempio' });
  await expect(source).toBeVisible();
  await expect(source.getByRole('button', { name: 'Tieni premuto per installare Modulo locale' })).toBeDisabled();
  const install = source.getByRole('button', { name: 'Tieni premuto per installare Modulo esempio' });
  await install.click();
  expect((await catalogState(pc)).installed).toHaveLength(0);
  await hold(install);
  await expect(source.getByText('Installato', { exact: true })).toBeVisible();
  await expect(page.getByText('Modifiche o aggiornamenti disponibili', { exact: true })).toBeVisible();
  await expect(
    source.getByRole('button', { name: 'Tieni premuto per rimuovere il repository Catalogo esempio' }),
  ).toBeDisabled();
  await catalogControl(pc, { version: '1.1.0' });
  await source.getByRole('button', { name: 'Aggiorna catalogo', exact: true }).click();
  await expect(source.getByText('Aggiornamento disponibile', { exact: true })).toBeVisible();
  await hold(source.getByRole('button', { name: 'Tieni premuto per aggiornare Modulo esempio' }));
  await expect(source.getByText('Installata: 1.1.0', { exact: false })).toBeVisible();
  await hold(source.getByRole('button', { name: 'Tieni premuto per rimuovere Modulo esempio' }));
  const removeSource = source.getByRole('button', {
    name: 'Tieni premuto per rimuovere il repository Catalogo esempio',
  });
  await expect(removeSource).toBeEnabled();
  await hold(removeSource);
  await expect(page.getByText('Nessun repository', { exact: true })).toBeVisible();
});

test('a failed sync refreshes its persisted error and retains installed versions', async ({ page, pc }) => {
  await pc.post('/trpc/catalog.addSource', { data: { url: CATALOG_URL } });
  await page.goto('/desk/settings/catalog');
  await catalogControl(pc, { failSync: true });
  await page.getByRole('button', { name: 'Aggiorna catalogo', exact: true }).click();
  await expect(page.getByText('Aggiornamento del catalogo non riuscito. Riprova.')).toBeVisible();
  await expect(page.getByText('Versione 1.0.0', { exact: true })).toHaveCount(2);
  await catalogControl(pc, { failSync: false });
});

test('a successful build restarts the desk without reloading it', async ({ page, pc }) => {
  await pc.post('/trpc/catalog.addSource', { data: { url: CATALOG_URL } });
  const source = (await catalogState(pc)).sources[0];
  await pc.post('/trpc/catalog.install', { data: { sourceId: source?.id, name: 'catalog-demo', confirmed: true } });
  await page.goto('/desk/settings/catalog');
  await page.evaluate(() => Object.assign(window, { catalogMarker: true }));
  await page.getByRole('button', { name: 'Ricostruisci e riavvia', exact: true }).click();
  await expect(page.getByText('Ricostruzione in corso', { exact: true })).toBeVisible();
  await expect(page.getByText('Riavvio in corso', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Impostazioni salvate, Hub è di nuovo attivo')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Modifiche da applicare', { exact: true })).not.toBeVisible();
  expect(await page.evaluate(() => 'catalogMarker' in window)).toBe(true);
});

test('a failed build retains pending changes and links to the job without restarting', async ({ page, pc }) => {
  await pc.post('/trpc/catalog.addSource', { data: { url: CATALOG_URL } });
  const source = (await catalogState(pc)).sources[0];
  await pc.post('/trpc/catalog.install', { data: { sourceId: source?.id, name: 'catalog-demo', confirmed: true } });
  await catalogControl(pc, { failBuild: true });
  await page.goto('/desk/settings/catalog');
  await page.getByRole('button', { name: 'Ricostruisci e riavvia', exact: true }).click();
  await expect(page.getByText('Ricostruzione non riuscita. Controlla il job e riprova.')).toBeVisible();
  await expect(page.getByText('Riavvio in corso', { exact: true })).not.toBeVisible();
  expect((await catalogState(pc)).pendingApply).toBe(true);
  await page.getByRole('link', { name: 'Apri Attività' }).click();
  await expect(page).toHaveURL(/\/desk\/system\?tab=jobs/);
});

test('paired phones cannot read the catalog or invoke its mutations', async ({ pc, phone }) => {
  const token = await pairDevice(pc, 'Catalog test phone');
  try {
    const headers = { authorization: `Bearer ${token}` };
    expect((await phone.get('/trpc/catalog.state', { headers })).status()).toBe(403);
    const mutations = {
      addSource: { url: CATALOG_URL },
      syncSource: { id: 'fixture-source' },
      removeSource: { id: 'fixture-source', confirmed: true },
      install: { sourceId: 'fixture-source', name: 'catalog-demo', confirmed: true },
      update: { name: 'catalog-demo', confirmed: true },
      remove: { name: 'catalog-demo', confirmed: true },
      applyChanges: {},
    };
    for (const [path, data] of Object.entries(mutations))
      expect((await phone.post(`/trpc/catalog.${path}`, { headers, data })).status()).toBe(403);
  } finally {
    await revokeDevices(pc, 'Catalog test phone');
  }
});

test('development builds clear pending state even when completion precedes the apply response', async ({
  page,
  pc,
}) => {
  await catalogControl(pc, { manualRestart: true });
  await expect
    .poll(async () => (await catalogState(pc).catch(() => null))?.canRestart, { timeout: 30_000 })
    .toBe(false);
  try {
    await pc.post('/trpc/catalog.addSource', { data: { url: CATALOG_URL } });
    const source = (await catalogState(pc)).sources[0];
    await pc.post('/trpc/catalog.install', { data: { sourceId: source?.id, name: 'catalog-demo', confirmed: true } });
    await page.route('**/trpc/catalog.applyChanges', async (route) => {
      const response = await route.fetch();
      // The fake build ends after 800 ms: deliver its HTTP result only after the subscription's terminal event.
      await page.waitForTimeout(1200);
      await route.fulfill({ response });
    });
    await page.goto('/desk/settings/catalog');
    await page.getByRole('button', { name: 'Ricostruisci e riavvia', exact: true }).click();
    await expect(
      page.getByText('Ricostruzione completata. Riavvia manualmente il processo di sviluppo di Hub.'),
    ).toBeVisible();
    await expect(page.getByText('Modifiche da applicare', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Modifiche o aggiornamenti disponibili', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Riavvio in corso', { exact: true })).not.toBeVisible();
    expect((await catalogState(pc)).pendingApply).toBe(false);
  } finally {
    await catalogControl(pc, { manualRestart: false });
    await expect
      .poll(async () => (await catalogState(pc).catch(() => null))?.canRestart, { timeout: 30_000 })
      .toBe(true);
  }
});

test('an installed module removed from a newer manifest remains removable', async ({ page, pc }) => {
  await pc.post('/trpc/catalog.addSource', { data: { url: CATALOG_URL } });
  const source = (await catalogState(pc)).sources[0];
  await pc.post('/trpc/catalog.install', { data: { sourceId: source?.id, name: 'catalog-demo', confirmed: true } });
  await catalogControl(pc, { hideDemo: true, version: '1.1.0' });
  await page.goto('/desk/settings/catalog');
  await page.getByRole('button', { name: 'Aggiorna catalogo', exact: true }).click();
  await expect(page.getByText('Non più presente nel catalogo.', { exact: true })).toBeVisible();
  await hold(page.getByRole('button', { name: 'Tieni premuto per rimuovere Modulo esempio' }));
  await expect(
    page.getByRole('button', { name: 'Tieni premuto per rimuovere il repository Catalogo esempio' }),
  ).toBeEnabled();
});
