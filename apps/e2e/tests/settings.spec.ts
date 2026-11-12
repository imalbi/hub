import { expect, test } from './fixtures.ts';
import type { APIRequestContext, Page } from '@playwright/test';
import { SERVER_PORT } from './hosts.ts';

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
  test('core settings apply MCP and job limits after restart', async ({ page, pc }) => {
    const server = `http://localhost:${SERVER_PORT}`;
    const core = async () => await (await pc.get(`${server}/__fake/core`)).json();
    const original = await core();
    try {
      await page.goto('/desk/settings');
      await page.getByRole('link', { name: 'Sistema e agenti' }).click();
      await page.getByRole('switch', { name: 'Attivo' }).uncheck();
      await page.getByRole('button', { name: 'Aumenta Job simultanei' }).click();
      await page.getByRole('button', { name: 'Salva e riavvia' }).click();
      await expect(page.getByText('Impostazioni salvate, Hub è di nuovo attivo')).toBeVisible(RESTARTED);
      await expect.poll(async () => core(), RESTARTED).toEqual({ mcp: false, jobs: original.jobs + 1 });
      expect((await pc.get(`${server}/mcp`)).status()).toBe(404);
    } finally {
      await pc.post('/trpc/settings.saveCore', {
        data: { mcp: { enabled: original.mcp }, jobs: { maxConcurrent: original.jobs } },
      });
      await expect.poll(async () => core().catch(() => null), RESTARTED).toEqual(original);
    }
  });

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
    await expect(page.getByRole('textbox', { name: 'Nome', exact: true })).toHaveValue('Località esempio');
    await expect(page.getByRole('group', { name: 'Latitudine' }).getByRole('status')).toHaveText(/^1\b/);
    await expect(page.getByRole('group', { name: 'Longitudine' }).getByRole('status')).toHaveText(/^2\b/);
    await page.getByRole('button', { name: 'Salva e riavvia' }).click();
    await expect(page.getByText('Impostazioni salvate, Hub è di nuovo attivo')).toBeVisible(RESTARTED);
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Nome', exact: true })).toHaveValue('Località esempio');
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
    await expect(list.getByRole('link')).toHaveCount(states.length + 2);
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

  test('a flat field is a control and a list of objects is rows; a refused value shows its message and saves nothing', async ({
    page,
    pc,
  }) => {
    await page.goto('/desk/settings/pomodoro');
    const save = page.getByRole('button', { name: 'Salva e riavvia' });
    await expect(save).toBeDisabled();
    await page.getByRole('button', { name: 'Aumenta Durata del focus' }).click();
    await expect(save).toBeEnabled();
    await page.getByRole('button', { name: 'Annulla' }).click();
    await expect(save).toBeDisabled();

    // Audio's outputs are rows of objects: an empty required cell is left for the server to refuse, next to the field.
    await page.goto('/desk/settings/audio');
    await page.getByRole('button', { name: 'Aggiungi: Uscite audio' }).click();
    await expect(page.getByRole('textbox', { name: 'Nome riga 1' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Testo da cercare riga 1' })).toBeVisible();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText(/Invalid input|expected string|Too small/).first()).toBeVisible();
    await expect(page.getByText('Riavvio in corso')).toHaveCount(0);
    const input = encodeURIComponent(JSON.stringify({ module: 'audio' }));
    const config = data(await (await pc.get(`/trpc/settings.config?input=${input}`)).json());
    expect(isRecord(config) && config.value).toBeFalsy();
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

/** The saved slice of a module's config as the server holds it now. */
async function savedValue(pc: APIRequestContext, name: string) {
  const input = encodeURIComponent(JSON.stringify({ module: name }));
  const config = data(await (await pc.get(`/trpc/settings.config?input=${input}`)).json());
  if (!isRecord(config)) throw new Error('no config');
  return config.value;
}

/** Saves the draft and waits for Hub to be back, like a real owner would. */
async function saveDraft(page: Page) {
  await page.getByRole('button', { name: 'Salva e riavvia' }).click();
  await expect(page.getByText('Impostazioni salvate, Hub è di nuovo attivo')).toBeVisible(RESTARTED);
}

/** Back to nothing written, for the next test (a plain API save restarts the fake in place). */
async function clearExample(pc: APIRequestContext) {
  if ((await savedValue(pc, 'hello')) === undefined) return;
  await pc.post('/trpc/settings.save', { data: { module: 'hello', enabled: true, value: {} } });
  await expect
    .poll(async () => JSON.stringify(await savedValue(pc, 'hello').catch(() => 'down')), RESTARTED)
    .toBe('{}');
}

if (example) {
  test('a field shows its Italian title as name and its help as description, with the fallback when unset', async ({
    page,
  }) => {
    await page.goto('/desk/settings/hello');
    const greeting = page.getByRole('textbox', { name: 'Saluto', exact: true });
    await expect(greeting).toHaveAccessibleDescription(/La frase che il modulo mostra\./);
    const interval = page.getByRole('group', { name: 'Intervallo', exact: true });
    await expect(interval).toHaveAccessibleDescription(/Ogni quanto ripete il saluto\./);
    // Unset with a default: the fallback is named, through the option label for a choice.
    await expect(interval).toHaveAccessibleDescription(/Predefinito: 15 minuti/);
    await expect(page.getByRole('button', { name: /^Luogo:/ })).toHaveAccessibleDescription(/Predefinito: In sede/);
    // Optional with no default.
    await expect(page.getByRole('textbox', { name: 'Soprannome', exact: true })).toHaveAccessibleDescription(
      /Non impostato/,
    );
  });

  test('picking a labelled number saves the number and nothing unset is written', async ({ page, pc }) => {
    try {
      await page.goto('/desk/settings/hello');
      await page.getByRole('button', { name: /^Luogo:/ }).click();
      await page.getByRole('option', { name: 'Ibrido' }).click();
      await saveDraft(page);
      // Only what the owner set: no `repeatMinutes`, no `nickname`, no other default.
      expect(await savedValue(pc, 'hello')).toEqual({ place: 3 });
    } finally {
      await clearExample(pc);
    }
  });

  test('a map of numbers is rows: add, change and remove save exactly that map; a bad key holds Salva', async ({
    page,
    pc,
  }) => {
    // Two saves, each restarting Hub.
    test.setTimeout(90_000);
    try {
      await page.goto('/desk/settings/hello');
      const save = page.getByRole('button', { name: 'Salva e riavvia' });
      const add = page.getByRole('button', { name: 'Aggiungi: Pesi' });
      await add.click();
      // A new row has no key yet: refused before anything is saved.
      await expect(page.getByRole('alert').filter({ hasText: 'La chiave non può essere vuota.' })).toBeVisible();
      await page.getByRole('textbox', { name: 'Pesi: chiave, riga 1' }).fill('alfa');
      await page.getByRole('button', { name: 'Aumenta alfa' }).click();
      await page.getByRole('button', { name: 'Aumenta alfa' }).click();
      await add.click();
      await page.getByRole('textbox', { name: 'Pesi: chiave, riga 2' }).fill('alfa');
      await expect(page.getByRole('alert').filter({ hasText: "c'è già" })).toBeVisible();
      await expect(save).toBeDisabled();
      await page.getByRole('textbox', { name: 'Pesi: chiave, riga 2' }).fill('beta');
      await expect(save).toBeEnabled();
      await saveDraft(page);
      expect(await savedValue(pc, 'hello')).toEqual({ weights: { alfa: 0.2, beta: 0 } });

      await page.reload();
      await page.getByRole('button', { name: 'Aumenta alfa' }).click();
      await page.getByRole('button', { name: 'Rimuovi beta' }).click();
      await saveDraft(page);
      expect(await savedValue(pc, 'hello')).toEqual({ weights: { alfa: 0.3 } });
    } finally {
      await clearExample(pc);
    }
  });

  for (const size of [
    { width: 1920, height: 1080 },
    { width: 3840, height: 2160 },
  ]) {
    test(`Avanzate fits its panel at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/desk/settings/hello');
      const panel = page.getByRole('region', { name: 'Avanzate' });
      const disclosure = panel.getByRole('button', { name: /^Gruppi/ });
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      await disclosure.click();
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
      await panel.getByRole('textbox', { name: 'Valore di Gruppi' }).fill(`[{"name":"${'x'.repeat(300)}","tags":[]}]`);
      const overflow = await panel.evaluate((root) => {
        const edge = root.getBoundingClientRect().right;
        const wider = [...root.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > edge + 0.5);
        return { scrolls: root.scrollWidth > root.clientWidth, wider: wider.map((el) => el.tagName) };
      });
      expect(overflow).toEqual({ scrolls: false, wider: [] });
    });
  }

  test('a long module page scrolls only inside the desk, never the document', async ({ page }) => {
    // Screen-reader-only live regions are absolutely positioned: without a containing block inside the
    // scroller they were placed against the body and stretched the document, so the page had two scrollbars.
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto('/desk/settings/hello');
    await expect(page.getByRole('heading', { name: 'Essenziale' })).toBeVisible();
    const sizes = await page.evaluate(() => ({
      document: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    }));
    expect(sizes.document).toBeLessThanOrEqual(sizes.viewport);
  });

  test('broken JSON in an advanced block holds Salva until it parses again', async ({ page }) => {
    await page.goto('/desk/settings/hello');
    const save = page.getByRole('button', { name: 'Salva e riavvia' });
    // The switch makes the draft dirty on its own, so only the broken JSON can be what holds Salva back.
    await page.getByRole('switch', { name: 'Modulo attivo' }).click();
    await expect(save).toBeEnabled();
    const block = page.getByRole('region', { name: 'Avanzate' });
    await block.getByRole('button', { name: /^Gruppi/ }).click();
    const text = block.getByRole('textbox', { name: 'Valore di Gruppi' });
    await expect(text).toHaveCSS('font-family', /mono/i);
    await text.fill('{');
    await expect(page.getByText(/JSON non valido/)).toBeVisible();
    await expect(save).toBeDisabled();
    await text.fill('[]');
    await expect(page.getByText('JSON valido')).toBeVisible();
    await expect(save).toBeEnabled();
  });

  test('a stepper, a select, a multi-select and a text input share height and text size', async ({ page }) => {
    await page.goto('/desk/settings/hello');
    const controls = [
      page.getByRole('group', { name: 'Intervallo', exact: true }),
      page.getByRole('button', { name: /^Luogo:/ }),
      page.getByRole('button', { name: /^Luoghi accettati:/ }),
      page.getByRole('textbox', { name: 'Saluto', exact: true }).locator('xpath=..'),
    ];
    const measured = [];
    for (const control of controls) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      const size = await control.evaluate((el) => getComputedStyle(el).fontSize);
      measured.push({ height: Math.round(box?.height ?? 0), size });
    }
    expect(new Set(measured.map((entry) => entry.height)).size, JSON.stringify(measured)).toBe(1);
    expect(new Set(measured.map((entry) => entry.size)).size, JSON.stringify(measured)).toBe(1);
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
