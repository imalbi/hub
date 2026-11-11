import { expect, test } from './fixtures.ts';
import type { APIRequestContext, Page } from '@playwright/test';

// Switching a module on or off restarts the fake server in place (`testing/fake.ts`): it is down for a moment and the
// socket reconnects with a back-off, so waiting for it is slower than any other assertion here.
const RESTARTED = { timeout: 30_000 };
const example = process.env.HUB_EXAMPLE_MODULES === '1';

type ModuleState = { name: string; status: string };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** The `result.data` of a tRPC answer, checked as far as these specs read it. */
function data(body: unknown): unknown {
  if (!isRecord(body) || !isRecord(body.result)) throw new Error('not a tRPC result');
  return body.result.data;
}

async function moduleStates(pc: APIRequestContext) {
  const res = await pc.get('/trpc/settings.modules');
  const list = data(await res.json());
  if (!Array.isArray(list)) throw new Error('settings.modules is not a list');
  return list.flatMap((entry): ModuleState[] =>
    isRecord(entry) && typeof entry.name === 'string' && typeof entry.status === 'string'
      ? [{ name: entry.name, status: entry.status }]
      : [],
  );
}

/** Flip a module's switch on its page and save; resolves once Hub answered again, without a reload. */
async function saveSwitch(page: Page, name: string) {
  await page.goto(`/desk/settings/${name}`);
  const toggle = page.getByRole('switch', { name: 'Modulo attivo' });
  await expect(toggle).toBeVisible();
  // A marker that a reload would wipe: the page must come back by itself.
  await page.evaluate(() => Object.assign(window, { restartMarker: 1 }));
  await toggle.click();
  await page.getByRole('button', { name: 'Salva e riavvia' }).click();
  await expect(page.getByText('Riavvio in corso')).toBeVisible();
  await expect(page.getByText('Impostazioni salvate, Hub è di nuovo attivo')).toBeVisible(RESTARTED);
  expect(await page.evaluate(() => 'restartMarker' in window)).toBe(true);
}

/** Puts a module back on through the API and waits for the restart to finish, for a test that died halfway. */
async function ensureOn(pc: APIRequestContext, name: string) {
  const states = await moduleStates(pc);
  if (states.find((entry) => entry.name === name)?.status !== 'off') return;
  await pc.post('/trpc/settings.save', { data: { module: name, enabled: true } });
  await expect
    .poll(async () => (await moduleStates(pc).catch(() => [])).find((entry) => entry.name === name)?.status, RESTARTED)
    .toBe('on');
}

if (!example) {
  test('weather location search shows empty and failed results and can retry', async ({ page }) => {
    let calls = 0;
    await page.route('**/trpc/weather.search*', async (route) => {
      calls++;
      if (calls === 2) await route.abort();
      else await route.fulfill({ json: [{ result: { data: [] } }] });
    });
    await page.goto('/desk/settings/weather');
    const search = page.getByLabel('Cerca località');
    const submit = page.getByRole('button', { name: 'Cerca', exact: true });
    await search.fill('Nessuno');
    await submit.click();
    await expect(page.getByText('Nessuna località trovata')).toBeVisible();
    await search.fill('Errore');
    await submit.click();
    await expect(page.getByRole('alert')).toHaveText('Ricerca non riuscita');
    await submit.click();
    await expect(page.getByText('Nessuna località trovata')).toBeVisible();
  });

  test('weather location search fills the settings draft', async ({ page }) => {
    await page.goto('/desk/settings/weather');
    await page.getByLabel('Cerca località').fill('Località');
    await page.getByRole('button', { name: 'Cerca', exact: true }).click();
    await page.getByRole('button', { name: 'Località esempio, Regione esempio' }).click();
    await expect(page.getByLabel('name', { exact: true })).toHaveValue('Località esempio');
    await expect(page.getByLabel('latitude', { exact: true })).toHaveValue('1');
    await expect(page.getByLabel('longitude', { exact: true })).toHaveValue('2');
    await page.getByRole('button', { name: 'Salva e riavvia' }).click();
    await expect(page.getByText('Impostazioni salvate, Hub è di nuovo attivo')).toBeVisible(RESTARTED);
    await page.reload();
    await expect(page.getByLabel('name', { exact: true })).toHaveValue('Località esempio');
  });

  test('the list has Generale with Aspetto and Moduli with a row per module and its state', async ({ page, pc }) => {
    await page.goto('/desk/settings');
    const list = page.getByRole('navigation', { name: 'Sezioni' });
    await expect(list.getByText('Generale', { exact: true })).toBeVisible();
    await expect(list.getByText('Moduli', { exact: true })).toBeVisible();
    await expect(list.getByRole('link', { name: /^Aspetto/ })).toBeVisible();
    // One row for Aspetto and one for every module the server knows, so a module cannot be left out of the list.
    const states = await moduleStates(pc);
    expect(states.length).toBeGreaterThan(5);
    await expect(list.getByRole('link')).toHaveCount(states.length + 1);
    await expect(list.getByRole('link', { name: /^Pomodoro\s*Attivo/ })).toBeVisible();
    // Every public module has Italian copy: Musica once listed as the raw name "Music".
    await expect(list.getByRole('link', { name: /^YouTube Music\s*Attivo/ })).toBeVisible();
    await expect(list.getByRole('link', { name: /^Music\b/ })).toHaveCount(0);
  });

  test('a module row opens its page beside the list; the back row, browser back and a deep link work', async ({
    page,
  }) => {
    await page.goto('/desk/settings');
    await page
      .getByRole('navigation', { name: 'Sezioni' })
      .getByRole('link', { name: /^Pomodoro/ })
      .click();
    await expect(page).toHaveURL(/\/desk\/settings\/pomodoro$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Pomodoro' })).toBeVisible();
    // The list is still there: it stays on the left while the page opens next to it.
    await expect(page.getByRole('navigation', { name: 'Sezioni' })).toBeVisible();
    await page.getByRole('main').getByRole('link', { name: 'Impostazioni', exact: true }).click();
    await expect(page).toHaveURL(/\/desk\/settings$/);
    await expect(page.getByText("Scegli una voce dall'elenco.")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/desk\/settings\/pomodoro$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/desk\/settings$/);
    // A deep link loads the page by itself, and Aspetto opens the same way.
    await page.goto('/desk/settings/audio');
    await expect(page.getByRole('heading', { level: 2, name: 'Audio' })).toBeVisible();
    await page.goto('/desk/settings');
    await page.getByRole('link', { name: /^Aspetto/ }).click();
    await expect(page).toHaveURL(/\/desk\/settings\/appearance$/);
    await expect(page.getByRole('region', { name: 'Aspetto' })).toBeVisible();
    // The rail still marks Impostazioni on a nested page.
    await expect(
      page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Impostazioni' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('a flat field is a control, a nested one a JSON block; a bad value or JSON shows its message and saves nothing', async ({
    page,
    pc,
  }) => {
    await page.goto('/desk/settings/pomodoro');
    const save = page.getByRole('button', { name: 'Salva e riavvia' });
    await expect(save).toBeDisabled();
    const focus = page.getByRole('spinbutton', { name: 'focusMinutes' });
    await focus.fill('30');
    await expect(save).toBeEnabled();
    // A value the schema refuses comes back as a message next to the field, and nothing restarts.
    await focus.fill('-1');
    await save.click();
    await expect(page.getByText(/Too small/)).toBeVisible();
    await expect(page.getByText('Riavvio in corso')).toHaveCount(0);
    const stored = (
      await (
        await pc.get('/trpc/settings.config?input=' + encodeURIComponent(JSON.stringify({ module: 'pomodoro' })))
      ).json()
    ).result.data.value;
    expect(stored).toBeUndefined();
    await page.getByRole('button', { name: 'Annulla' }).click();
    await expect(save).toBeDisabled();

    // Audio's outputs are a list of objects: not a flat field, so a JSON block with its own validation line.
    await page.goto('/desk/settings/audio');
    const block = page.getByRole('textbox', { name: 'Valore di outputs' });
    await expect(block).toBeVisible();
    await expect(block).toHaveCSS('font-family', /mono/i);
    const audioSave = page.getByRole('button', { name: 'Salva e riavvia' });
    // The switch makes the draft dirty on its own, so only the broken JSON can be what holds Salva back.
    await page.getByRole('switch', { name: 'Modulo attivo' }).click();
    await expect(audioSave).toBeEnabled();
    await block.fill('{');
    await expect(page.getByText(/JSON non valido/)).toBeVisible();
    await expect(audioSave).toBeDisabled();
    await block.fill('[]');
    await expect(page.getByText('JSON valido')).toBeVisible();
    await expect(audioSave).toBeEnabled();
  });

  test('a save restarts Hub: Riavvio in corso shows, then the page is back by itself and the module is off', async ({
    page,
    pc,
  }) => {
    try {
      await saveSwitch(page, 'news');
      await expect(
        page.getByRole('navigation', { name: 'Sezioni' }).getByRole('link', { name: /^Notizie\s*Spento/ }),
      ).toBeVisible(RESTARTED);
      expect((await moduleStates(pc)).find((entry) => entry.name === 'news')?.status).toBe('off');
      // Off hides the module from the phone's list too: names only, and not this one.
      const enabled = data(await (await pc.get('/trpc/modules.enabled')).json());
      expect(Array.isArray(enabled) && enabled.includes('news')).toBe(false);
    } finally {
      await ensureOn(pc, 'news');
    }
  });
}

if (!example) {
  test('with Musica off, Media keeps the player and the output button but has no music search', async ({
    page,
    pc,
  }) => {
    try {
      await saveSwitch(page, 'music');
      await page.goto('/desk/media');
      await expect(page.getByRole('region', { name: 'Player musicale' })).toBeVisible(RESTARTED);
      await expect(page.getByRole('button', { name: 'Cambia uscita audio' })).toBeVisible();
      await expect(page.getByRole('searchbox', { name: 'Cerca musica' })).toHaveCount(0);
    } finally {
      await ensureOn(pc, 'music');
    }
  });
}

if (example) {
  test('switching the example module off hides it everywhere after the restart, and on brings it and its data back', async ({
    page,
    pc,
  }) => {
    const rail = page.getByRole('navigation', { name: 'Zone' });
    const count = async () => {
      const state = data(await (await pc.get('/trpc/hello.state')).json());
      if (!isRecord(state) || typeof state.count !== 'number') throw new Error('no count');
      return state.count;
    };
    await pc.post('/trpc/hello.greet', { data: {} });
    const before = await count();
    expect(before).toBeGreaterThan(0);
    try {
      await page.goto('/desk');
      await expect(rail.getByRole('link', { name: 'Esempio', exact: true })).toBeVisible();
      await expect(rail.getByRole('link', { name: 'Lavoro', exact: true })).toBeVisible();

      await saveSwitch(page, 'hello');
      await expect(rail.getByRole('link', { name: 'Esempio', exact: true })).toHaveCount(0, RESTARTED);
      // Its section was the only one on Lavoro, so the zone goes with it.
      await expect(rail.getByRole('link', { name: 'Lavoro', exact: true })).toHaveCount(0);
      await page.goto('/desk');
      await page.getByRole('button', { name: 'Modifica', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Aggiungi Esempio', exact: true })).toHaveCount(0);
      await page.goto('/desk/hello');
      await expect(page.getByText('Pagina non trovata')).toBeVisible();

      await saveSwitch(page, 'hello');
      await expect(rail.getByRole('link', { name: 'Esempio', exact: true })).toBeVisible(RESTARTED);
      await expect(rail.getByRole('link', { name: 'Lavoro', exact: true })).toBeVisible();
      // Its database file was not touched while it was off.
      expect(await count()).toBe(before);
    } finally {
      await ensureOn(pc, 'hello');
    }
  });
}
