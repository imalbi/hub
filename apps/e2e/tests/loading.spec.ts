import { expect, test } from './fixtures.ts';
import { clean, seed } from './calendar-data.ts';
import type { Page } from '@playwright/test';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

async function delaySubscription(page: Page, path: string) {
  let release = () => {};
  await page.routeWebSocket(/\/trpc/, (socket) => {
    const server = socket.connectToServer();
    const ids = new Set<unknown>();
    const waiting: (string | Buffer)[] = [];
    let released = false;
    release = () => {
      released = true;
      for (const message of waiting) socket.send(message);
    };
    socket.onMessage((message) => {
      const value: unknown = JSON.parse(message.toString());
      for (const item of Array.isArray(value) ? value : [value])
        if (isObject(item) && isObject(item.params) && item.params.path === path) ids.add(item.id);
      server.send(message);
    });
    server.onMessage((message) => {
      const value: unknown = JSON.parse(message.toString());
      if (!released && isObject(value) && ids.has(value.id) && isObject(value.result) && value.result.type === 'data')
        waiting.push(message);
      else socket.send(message);
    });
  });
  return () => release();
}

function expectStableBox(
  before: { x: number; y: number; width: number; height: number } | null,
  after: { x: number; y: number; width: number; height: number } | null,
) {
  if (!before || !after) throw new Error('Content must be laid out');
  expect(Math.abs(before.x - after.x)).toBeLessThanOrEqual(8);
  expect(Math.abs(before.y - after.y)).toBeLessThanOrEqual(8);
  expect(Math.abs(before.width - after.width)).toBeLessThanOrEqual(8);
  expect(Math.abs(before.height - after.height)).toBeLessThanOrEqual(8);
}

function expectStablePosition(
  before: { x: number; y: number; width: number; height: number } | null,
  after: { x: number; y: number; width: number; height: number } | null,
) {
  if (!before || !after) throw new Error('Content must be laid out');
  expect(Math.abs(before.x - after.x)).toBeLessThanOrEqual(8);
  expect(Math.abs(before.y - after.y)).toBeLessThanOrEqual(8);
  expect(Math.abs(before.width - after.width)).toBeLessThanOrEqual(8);
}

test('Sistema audio rows retain their boxes while audio state is delayed', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  const release = await delaySubscription(page, 'audio.onState');
  await page.goto('/desk/system');
  const audio = page.getByRole('region', { name: 'Audio', exact: true });
  const rows = audio.locator('fieldset');
  await expect(audio.getByRole('status', { name: 'Caricamento' })).toHaveCount(3);
  const before = await rows.all();
  const boxes = await Promise.all(before.map((row) => row.boundingBox()));
  release();
  await expect(audio.getByRole('status', { name: 'Caricamento' })).toHaveCount(0);
  for (let i = 0; i < before.length; i++) expectStableBox(boxes[i] ?? null, (await before[i]?.boundingBox()) ?? null);
});

for (const entry of [
  { widget: 'audio', subscription: 'audio.onState' },
  { widget: 'media', subscription: 'media.onState' },
  { widget: 'pomodoro', subscription: 'pomodoro.onState' },
  { widget: 'audio', subscription: 'audio.onState', size: 'medium' },
  { widget: 'media', subscription: 'media.onState', size: 'large' },
  { widget: 'pomodoro', subscription: 'pomodoro.onState', size: 'large' },
]) {
  test(`${entry.widget} ${entry.size ?? 'small'} widget keeps its geometry while loading`, async ({ page, pc }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await pc.post('/trpc/layout.save', {
      data: { zone: 'overview', items: [{ widget: entry.widget, size: entry.size ?? 'small', x: 0, y: 0 }] },
    });
    let release = () => {};
    await page.routeWebSocket(/\/trpc/, (socket) => {
      const server = socket.connectToServer();
      const ids = new Set<unknown>();
      const waiting: (string | Buffer)[] = [];
      let released = false;
      release = () => {
        released = true;
        for (const message of waiting) socket.send(message);
      };
      socket.onMessage((message) => {
        const value: unknown = JSON.parse(message.toString());
        for (const item of Array.isArray(value) ? value : [value])
          if (isObject(item) && isObject(item.params) && item.params.path === entry.subscription) ids.add(item.id);
        server.send(message);
      });
      server.onMessage((message) => {
        const value: unknown = JSON.parse(message.toString());
        if (!released && isObject(value) && ids.has(value.id) && isObject(value.result) && value.result.type === 'data')
          waiting.push(message);
        else socket.send(message);
      });
    });
    try {
      await page.goto('/desk');
      const widget = page.locator(`[data-widget="${entry.widget}"]`);
      const skeleton = widget.getByRole('status', { name: 'Caricamento' });
      await expect(skeleton.first()).toBeVisible();
      // The board can first draw another layout (a widget another spec added) before the saved one arrives.
      await expect(page.locator('[data-widget]')).toHaveCount(1);
      const before = await widget.boundingBox();
      release();
      await expect(skeleton).toHaveCount(0);
      const after = await widget.boundingBox();
      if (!before || !after) throw new Error('Widget must remain laid out');
      expect(Math.abs(before.x - after.x)).toBeLessThanOrEqual(8);
      expect(Math.abs(before.y - after.y)).toBeLessThanOrEqual(8);
      expect(Math.abs(before.width - after.width)).toBeLessThanOrEqual(8);
      expect(Math.abs(before.height - after.height)).toBeLessThanOrEqual(8);
    } finally {
      await pc.post('/trpc/layout.reset', { data: { zone: 'overview' } });
    }
  });
}

const cases = [
  {
    name: 'settings core',
    url: '/desk/settings/core',
    query: 'settings.core',
    label: 'Carico le impostazioni',
    selectors: ['main nav a[href="/desk/settings/appearance"]', 'main h2', 'main [data-panel]'],
  },
  {
    name: 'settings module',
    url: '/desk/settings/audio',
    query: 'settings.config',
    label: 'Carico le impostazioni',
    selectors: ['main nav a[href="/desk/settings/appearance"]', 'main h2', 'main [data-panel]'],
  },
];

for (const entry of cases) {
  test(`${entry.name} holds its position while loading`, async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/trpc/*', async (route) => {
      if (!decodeURIComponent(route.request().url()).includes(entry.query)) return route.fallback();
      await pending;
      await route.continue();
    });
    await page.goto(entry.url);
    const skeleton = page.getByRole('status', { name: entry.label }).first();
    await expect(skeleton).toBeVisible();
    const boxes = await Promise.all(entry.selectors.map((selector) => page.locator(selector).first().boundingBox()));
    release();
    await expect(skeleton).toHaveCount(0);
    for (const [index, selector] of entry.selectors.entries()) {
      const target = page.locator(selector).first();
      await expect(target).toBeVisible();
      expectStablePosition(boxes[index] ?? null, await target.boundingBox());
    }
  });
}

async function delayQuery(page: Page, path: string) {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/trpc/*', async (route) => {
    const paths = new URL(route.request().url()).pathname.replace('/trpc/', '').split(',');
    if (!paths.includes(path)) return route.fallback();
    await pending;
    await route.continue();
  });
  return release;
}

for (const view of ['month', 'agenda']) {
  test(`calendar ${view} waits for initial events before showing content`, async ({ page, pc }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 15, 10));
    await seed(pc);
    await page.addInitScript((value) => localStorage.setItem('hub.calendar.view', JSON.stringify(value)), view);
    const release = await delayQuery(page, 'calendar.range');
    try {
      await page.goto('/desk/calendar');
      const content =
        view === 'month'
          ? page.getByRole('complementary', { name: 'domenica 15 novembre' })
          : page.getByRole('region', { name: 'Prossimi giorni' });
      const loading = content.getByRole('status', { name: 'Caricamento' });
      await expect(loading).toBeVisible();
      await expect(content.locator('[data-empty-scene="calendar"]')).toHaveCount(0);
      release();
      await expect(loading).toHaveCount(0);
      await expect(content.getByText('Dentista', { exact: true })).toBeVisible();
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
      await page.close();
      await clean(pc);
    }
  });
}

for (const size of ['medium', 'large', 'wide', 'full']) {
  test(`notes ${size} waits for initial subscription before showing an empty state`, async ({ page, pc }) => {
    await pc.post('/trpc/layout.save', {
      data: { zone: 'overview', items: [{ widget: 'notes', size, x: 0, y: 0 }] },
    });
    const release = await delaySubscription(page, 'notes.onOpen');
    try {
      await page.goto('/desk');
      const widget = page.locator('[data-widget="notes"]');
      const loading = widget.getByRole('status', { name: 'Caricamento' });
      await expect(loading).toBeVisible();
      await expect(widget.getByText('Nessun post-it. Premi N per scriverne uno.')).toHaveCount(0);
      release();
      await expect(loading).toHaveCount(0);
      await expect(widget.getByText('Nessun post-it. Premi N per scriverne uno.')).toBeVisible();
    } finally {
      release();
      await page.close();
      await pc.post('/trpc/layout.reset', { data: { zone: 'overview' } });
    }
  });
}

for (const entry of [
  {
    name: 'devices',
    path: '/desk/devices',
    query: 'devices.list',
    label: 'Caricamento',
    empty: 'Nessun dispositivo abbinato',
  },
  {
    name: 'catalog',
    path: '/desk/settings/catalog',
    query: 'catalog.state',
    label: 'Carico le impostazioni',
    empty: 'Nessun repository',
  },
]) {
  test(`${entry.name} waits for initial query with a skeleton`, async ({ page }) => {
    const release = await delayQuery(page, entry.query);
    try {
      await page.goto(entry.path);
      const loading =
        entry.name === 'devices'
          ? page.getByRole('region', { name: 'Telefoni e tablet' }).getByRole('status', { name: entry.label })
          : page.getByRole('status', { name: entry.label });
      await expect(loading).toBeVisible();
      await expect(loading.locator('[aria-hidden="true"]')).toHaveCount(3);
      await expect(page.getByText(entry.empty, { exact: true })).toHaveCount(0);
      release();
      await expect(loading).toHaveCount(0);
      if (entry.name === 'catalog') await expect(page.getByText(entry.empty, { exact: true })).toBeVisible();
      else
        await expect(page.getByRole('region', { name: 'Telefoni e tablet' }).getByRole('listitem')).not.toHaveCount(0);
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}
