import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { answerQueries, pairDevice, revokeDevices } from './desktop.ts';

const cell = (page: Page, widget: string) => page.locator(`[data-widget="${widget}"]`);
// Layout changes animate in edit mode; measure once the grid has settled.
const box = async (page: Page, widget: string) => {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.react-grid-item')].every((item) => item.getAnimations().length === 0),
  );
  const rect = await cell(page, widget).boundingBox();
  if (!rect) throw new Error(`${widget} is not on the board`);
  return rect;
};

/** Runs an action that changes the board and waits until the server has stored it, so a reload reads it back. */
async function andSaved(page: Page, action: () => Promise<void>) {
  const response = page.waitForResponse((res) => res.url().includes('/trpc/layout.save') && res.ok());
  await action();
  await response;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/desk');
  await expect(cell(page, 'pomodoro')).toBeVisible();
});

test.afterEach(async ({ pc }) => {
  await pc.post('/trpc/layout.reset', {
    data: { zone: 'overview' },
    headers: { 'content-type': 'application/json' },
  });
});

test('the core widget and zone say Media without the optional Musica module', async ({ page }) => {
  await expect(cell(page, 'media').getByRole('heading', { name: 'Media', exact: true })).toBeVisible();
  await expect(cell(page, 'media').getByText('Musica', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Media', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Media', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Musica', exact: true })).toHaveCount(0);
});

test('widget labels and measured figures use the self-hosted mono voice', async ({ page, pc, browser }) => {
  const ids = ['pomodoro', 'audio', 'devices', 'power', 'server'];
  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: ids.map((widget, y) => ({ widget, size: 'small', x: 0, y })) },
  });
  const fresh = await browser.newPage();
  const font = fresh.waitForResponse((response) => /jetbrains-mono.*\.woff2/.test(response.url()) && response.ok());
  await fresh.goto(page.url());
  await font;
  await fresh.close();
  await page.reload();
  for (const id of ids) {
    const widget = cell(page, id);
    const title = widget.getByRole('heading').first();
    // Mono only for figures (owner, 2026-11-17): a widget title is an Urbanist label in capitals.
    await expect(title).toHaveCSS('font-family', /Urbanist/);
    await expect(title).toHaveCSS('text-transform', 'uppercase');
    await expect(widget.locator('[data-readout]').first()).toHaveCSS('font-family', /JetBrains Mono/);
    await expect(widget.locator('[data-readout]').first()).toHaveCSS('font-variant-numeric', /tabular-nums/);
  }
});

test('Oggi leads the default board; the Italian date is said once, in the day line', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
  await page.reload();
  await expect(page.locator('[data-widget]').first()).toHaveAttribute('data-widget', 'today');
  const today = cell(page, 'today');
  await expect(page.getByText('mercoledì 4 novembre', { exact: true })).toHaveCount(1);
  await expect(today.getByText('mercoledì 4 novembre')).toHaveCount(0);
  await expect(today.locator('[data-readout]').first()).toHaveCSS('font-family', /JetBrains Mono/);
  await expect(today.getByText('Località esempio')).toHaveCount(0);
  await expect(today.locator('[data-today-header]')).toHaveCount(process.env.HUB_EXAMPLE_MODULES === '1' ? 1 : 0);
});

test('C3: the default board of a fresh layout is P1 public widgets in P1 order', async ({ page, pc }) => {
  await pc.post('/trpc/layout.reset', {
    data: { zone: 'overview' },
    headers: { 'content-type': 'application/json' },
  });
  await page.reload();
  const items = page.locator('[data-widget]');
  await expect(items).toHaveCount(6);
  expect(await items.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-widget')))).toEqual([
    'today',
    'pomodoro',
    'audio',
    'media',
    'calendar',
    'devices',
  ]);
  expect(await items.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-size')))).toEqual([
    'wide',
    'small',
    'small',
    'medium',
    'large',
    'large',
  ]);
});

test('widgets on the same row have the same height, two small ones fill a medium width', async ({ page, pc }) => {
  await pc.post('/trpc/layout.save', {
    data: {
      zone: 'overview',
      items: [
        { widget: 'pomodoro', size: 'medium', x: 0, y: 0 },
        { widget: 'media', size: 'medium', x: 6, y: 0 },
        { widget: 'server', size: 'small', x: 0, y: 1 },
        { widget: 'audio', size: 'small', x: 3, y: 1 },
      ],
    },
  });
  await page.reload();
  await expect(cell(page, 'server')).toBeVisible();
  const [pomodoro, media, server, audio] = await Promise.all(
    ['pomodoro', 'media', 'server', 'audio'].map((widget) => box(page, widget)),
  );
  // One row is --spacing-widget-row at the desk's root size (15rem at 24px); a stale read of the root before the desk
  // layout applied once gave 240px rows that cut the Media widget.
  expect(pomodoro.height).toBeCloseTo(360, 0);
  expect(media.height).toBeCloseTo(pomodoro.height, 0);
  expect(media.y).toBeCloseTo(pomodoro.y, 0);
  expect(audio.height).toBeCloseTo(server.height, 0);
  expect(audio.y).toBeCloseTo(server.y, 0);
  // Two Piccoli and their gap span exactly one Medio.
  expect(audio.x + audio.width - server.x).toBeCloseTo(pomodoro.width, 0);
});

test('Modifica is inside the surface above the first widget', async ({ page }) => {
  const surface = page.locator('[data-page-surface]');
  await expect(surface).toHaveCount(1);
  const outer = await surface.boundingBox();
  const button = await page.getByRole('button', { name: 'Modifica', exact: true }).boundingBox();
  const first = await page.locator('[data-widget]').first().boundingBox();
  expect(
    outer &&
      button &&
      first &&
      button.x >= outer.x &&
      button.x + button.width <= outer.x + outer.width &&
      button.y >= outer.y &&
      button.y + button.height <= first.y,
  ).toBe(true);
  await expect(surface.locator('[data-panel] [data-panel]')).toHaveCount(0);
});

test('a size chosen in edit mode resizes the widget and survives a reload', async ({ page }) => {
  const before = await box(page, 'pomodoro');
  await page.getByRole('button', { name: 'Modifica' }).click();
  const sizes = page.getByRole('group', { name: 'Dimensione di Pomodoro' });
  await andSaved(page, () => sizes.locator('label', { has: page.getByRole('radio', { name: 'Grande' }) }).click());
  await expect.poll(async () => (await box(page, 'pomodoro')).height).toBeGreaterThan(before.height * 1.5);
  await page.getByRole('button', { name: 'Fine' }).click();
  await page.reload();
  await expect(cell(page, 'pomodoro')).toHaveAttribute('data-size', 'large');
  // The large variant is the full panel, with the ring and the daily count.
  await expect(cell(page, 'pomodoro').getByText(/^Sessioni completate oggi/)).toBeVisible();
});

test('the large Media widget fits its cell: the hero-sized cover once pushed the title and controls out', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Modifica' }).click();
  const sizes = page.getByRole('group', { name: 'Dimensione di Media' });
  await andSaved(page, () => sizes.locator('label', { has: page.getByRole('radio', { name: 'Grande' }) }).click());
  await page.getByRole('button', { name: 'Fine' }).click();
  await box(page, 'media');
  const panel = cell(page, 'media').locator('section').first();
  const overflow = await panel.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a widget is removed, offered in Aggiungi widget, and added back', async ({ page }) => {
  await page.getByRole('button', { name: 'Modifica' }).click();
  await andSaved(page, () => page.getByRole('button', { name: 'Aggiungi Server' }).click());
  await andSaved(page, () => page.getByRole('button', { name: 'Rimuovi Server' }).click());
  await expect(cell(page, 'server')).toHaveCount(0);
  await page.reload();
  await expect(cell(page, 'server')).toHaveCount(0);
  await page.getByRole('button', { name: 'Modifica' }).click();
  await page.getByRole('button', { name: 'Aggiungi Server' }).click();
  await expect(cell(page, 'server')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aggiungi Server' })).toHaveCount(0);
});

test('Sposta dopo moves a widget without dragging, for the keyboard', async ({ page }) => {
  await page.getByRole('button', { name: 'Modifica' }).click();
  await page.getByRole('button', { name: 'Sposta dopo Pomodoro' }).focus();
  await andSaved(page, () => page.keyboard.press('Enter'));
  await expect.poll(async () => (await box(page, 'audio')).x < (await box(page, 'pomodoro')).x).toBe(true);
  await page.reload();
  await expect.poll(async () => (await box(page, 'audio')).x < (await box(page, 'pomodoro')).x).toBe(true);
});

test('dragging a widget in edit mode rearranges the board and is saved', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: 'Modifica' }).click();
  const from = await box(page, 'pomodoro');
  const to = await box(page, 'audio');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + (to.width * 3) / 4, to.y + to.height / 2, { steps: 20 });
  await andSaved(page, () => page.mouse.up());
  await expect.poll(async () => (await box(page, 'pomodoro')).x).toBeGreaterThan(from.x);
  await page.reload();
  await expect.poll(async () => (await box(page, 'pomodoro')).x).toBeGreaterThan(from.x);
});

test('outside edit mode nothing drags and the widgets work as usual', async ({ page }) => {
  // The widget can start below the fold; a drag from off screen scrolled the board under the pointer.
  await cell(page, 'audio').scrollIntoViewIfNeeded();
  const from = await box(page, 'audio');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x - 300, from.y - 300, { steps: 10 });
  await page.mouse.up();
  expect(await box(page, 'audio')).toEqual(from);
  await expect(cell(page, 'pomodoro').getByRole('button', { name: 'Avvia' })).toBeEnabled();
});

test('Panoramica offers every widget, the ones that also have a page included', async ({ page }) => {
  await page.getByRole('button', { name: 'Modifica' }).click();
  const missing = ['Server', 'Comandi', 'Consumo', 'Aspetto', 'Post-it'];
  if (process.env.HUB_EXAMPLE_MODULES === '1') missing.push('Esempio');
  await expect(page.getByRole('button', { name: /^Aggiungi (?!widget$)/ })).toHaveText(missing);
  await andSaved(page, () => page.getByRole('button', { name: 'Aggiungi Aspetto' }).click());
  await expect(cell(page, 'theme')).toBeVisible();
});

test('edit mode dims and disables content, and focuses the missing list', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Aggiungi widget', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Modifica', exact: true }).click();
  const pomodoro = cell(page, 'pomodoro');
  await expect(pomodoro.locator('[inert]')).toHaveCSS('opacity', '0.3');
  await expect(pomodoro.locator('.widget-tools').first()).toHaveCSS('opacity', '1');
  await expect(pomodoro.locator('[inert]')).toHaveAttribute('inert', '');
  const play = await pomodoro.getByRole('button', { name: 'Avvia', includeHidden: true }).boundingBox();
  if (!play) throw new Error('Pomodoro play button has no box');
  await page.mouse.click(play.x + play.width / 2, play.y + play.height / 2);
  await page.getByRole('button', { name: 'Fine', exact: true }).click();
  await expect(pomodoro.getByRole('button', { name: 'Avvia' })).toBeVisible();
  await page.getByRole('button', { name: 'Modifica', exact: true }).click();
  await page.getByRole('button', { name: 'Aggiungi widget', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Aggiungi Server' })).toBeFocused();
  await page.getByRole('button', { name: 'Aggiungi Comandi' }).click();
  await expect(cell(page, 'controls')).toHaveAttribute('data-size', 'large');
});

test('edit actions share one split pill', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.getByRole('button', { name: 'Modifica', exact: true }).click();
  const pill = page.locator('.split-pill');
  const add = pill.getByRole('button', { name: 'Aggiungi widget', exact: true });
  await expect(add).toBeVisible();
  await expect(pill.getByRole('button', { name: 'Ripristina', exact: true })).toBeVisible();
  await expect(pill.getByRole('button', { name: 'Fine', exact: true })).toBeVisible();
  await pill.getByRole('button', { name: 'Fine', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(add).toBeFocused();
  await expect(add).toHaveCSS('outline-offset', '-2px');
  await expect(add.locator('..')).toHaveCSS('filter', 'none');
  await page.screenshot({ path: testInfo.outputPath('split-pill-focus-4k.png') });
  await add.click();
  await expect(page.getByRole('button', { name: 'Aggiungi Server' })).toBeFocused();
});

test('all widgets fit within the surface scroller', async ({ page, pc }) => {
  const ids = [
    'today',
    'pomodoro',
    'media',
    'server',
    'controls',
    'power',
    'audio',
    'devices',
    'theme',
    'notes',
    'calendar',
  ];
  if (process.env.HUB_EXAMPLE_MODULES === '1') ids.push('hello');
  const items = ids.map((widget, index) => ({
    widget,
    size:
      widget === 'today'
        ? 'wide'
        : widget === 'controls' || widget === 'theme'
          ? 'large'
          : widget === 'notes' || widget === 'hello'
            ? 'medium'
            : 'small',
    x: 0,
    y: index * 2,
  }));
  await pc.post('/trpc/layout.save', { data: { zone: 'overview', items } });
  await page.reload();
  await page.getByRole('button', { name: 'Modifica', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Aggiungi widget', exact: true })).toBeDisabled();
  await expect(page.getByText('quelli non ancora in Panoramica')).toHaveCount(0);
  const dimensions = await page.evaluate(() => ({
    html: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    body: document.querySelector('[data-page-surface] > div')?.scrollHeight ?? 0,
    height: document.querySelector('[data-page-surface] > div')?.clientHeight ?? 0,
  }));
  expect(dimensions.html).toBe(0);
  expect(dimensions.body).toBeGreaterThan(dimensions.height);
});

test('Dispositivi shows access in both sizes and revocation requires a hold', async ({ page, pc }) => {
  await pairDevice(pc, 'Phone A');
  await pairDevice(pc, 'Phone B');
  try {
    await page.reload();
    const widget = cell(page, 'devices');
    await expect(widget).toHaveAttribute('data-size', 'large');
    await page.getByRole('button', { name: 'Modifica', exact: true }).click();
    await andSaved(page, () =>
      page
        .getByRole('group', { name: 'Dimensione di Dispositivi' })
        .locator('label', { has: page.getByRole('radio', { name: 'Piccolo' }) })
        .click(),
    );
    await expect(widget).toHaveAttribute('data-size', 'small');
    await page.getByRole('button', { name: 'Fine' }).click();
    await expect(widget.getByText('Phone A')).toHaveCount(0);
    await expect(widget.getByText('telefoni', { exact: true })).toBeVisible();
    await expect(widget.getByRole('link', { name: 'Collega', exact: true })).toHaveAttribute('href', '/desk/devices');
    await page.getByRole('button', { name: 'Modifica', exact: true }).click();
    await andSaved(page, () =>
      page
        .getByRole('group', { name: 'Dimensione di Dispositivi' })
        .locator('label', { has: page.getByRole('radio', { name: 'Grande' }) })
        .click(),
    );
    await page.getByRole('button', { name: 'Fine' }).click();
    await expect(widget.getByText('Phone A', { exact: true })).toBeVisible();
    await expect(widget.getByText('Phone B', { exact: true })).toBeVisible();
    await expect(widget.getByText('Su questo PC')).toBeVisible();
    await expect(widget.getByRole('button', { name: 'Chiamate di Su questo PC' })).toBeVisible();
    await expect(widget.getByRole('button', { name: /Mostra QR|Genera codice/ })).toHaveCount(0);
    const rows = widget.locator('section[aria-label] > ul > li');
    const boxes = await rows.evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
    );
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom);
    const revoke = widget.getByRole('button', { name: 'Tieni premuto per revocare Phone A' });
    await page.clock.install();
    await revoke.click();
    await expect(widget.getByText('Phone A', { exact: true })).toBeVisible();
    await revoke.hover();
    await page.mouse.down();
    await page.clock.runFor(900);
    await page.mouse.up();
    await expect(widget.getByText('Phone A', { exact: true })).toHaveCount(0);
  } finally {
    await revokeDevices(pc, 'Phone A');
    await revokeDevices(pc, 'Phone B');
  }
});

test('Dispositivi counts two phones and its large rows fit without overlap', async ({ page, pc }) => {
  const now = Date.now();
  await answerQueries(page, {
    'devices.list': [
      { id: 100, name: 'Phone A', createdAt: now, lastSeenAt: now },
      { id: 101, name: 'Phone B', createdAt: now, lastSeenAt: now },
    ],
  });
  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: [{ widget: 'devices', size: 'small', x: 0, y: 0 }] },
  });
  await page.reload();
  const widget = cell(page, 'devices');
  await expect(widget.locator('[aria-hidden="true"]').getByText('2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Modifica', exact: true }).click();
  await page
    .getByRole('group', { name: 'Dimensione di Dispositivi' })
    .locator('label', { has: page.getByRole('radio', { name: 'Grande' }) })
    .click();
  await page.getByRole('button', { name: 'Fine', exact: true }).click();
  await expect(widget.getByText('Su questo PC')).toBeVisible();
  const bounds = await widget.evaluate((el) => {
    const outer = el.getBoundingClientRect();
    const rows = [...el.querySelectorAll('section[aria-label] > ul > li')].map((row) => {
      const rect = row.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    });
    return { top: outer.top, bottom: outer.bottom, left: outer.left, right: outer.right, rows };
  });
  expect(bounds.rows).toHaveLength(3);
  for (const [index, row] of bounds.rows.entries()) {
    expect(row.top).toBeGreaterThanOrEqual(bounds.top);
    expect(row.bottom).toBeLessThanOrEqual(bounds.bottom);
    expect(row.left).toBeGreaterThanOrEqual(bounds.left);
    expect(row.right).toBeLessThanOrEqual(bounds.right);
    if (index) expect(row.top).toBeGreaterThanOrEqual(bounds.rows[index - 1].bottom);
  }
});

test('a failed layout save restores the saved board and reports the failure', async ({ page }) => {
  await page.route('**/trpc/layout.save*', (route) =>
    route.fulfill({ status: 500, json: { error: { message: 'Unavailable' } } }),
  );
  await page.getByRole('button', { name: 'Modifica', exact: true }).click();
  await page.getByRole('button', { name: 'Rimuovi Pomodoro', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('salv');
  await expect(cell(page, 'pomodoro')).toBeVisible();
});

test('rapid layout edits save in order and retain the latest board', async ({ page }) => {
  let active = 0;
  let maximum = 0;
  let completed = 0;
  await page.route('**/trpc/layout.save*', async (route) => {
    active += 1;
    maximum = Math.max(maximum, active);
    if (completed === 0) await new Promise((resolve) => setTimeout(resolve, 300));
    const response = await route.fetch();
    await route.fulfill({ response });
    active -= 1;
    completed += 1;
  });
  await page.getByRole('button', { name: 'Modifica', exact: true }).click();
  await page.getByRole('button', { name: 'Rimuovi Pomodoro', exact: true }).click();
  await page.getByRole('button', { name: 'Rimuovi Uscita audio', exact: true }).click();
  await expect.poll(() => completed).toBe(2);
  expect(maximum).toBe(1);
  await page.reload();
  await expect(cell(page, 'today')).toBeVisible();
  await expect(cell(page, 'pomodoro')).toHaveCount(0);
  await expect(cell(page, 'audio')).toHaveCount(0);
});
