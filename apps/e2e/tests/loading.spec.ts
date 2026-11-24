import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from './fixtures.ts';
import { RUN_TMP } from './hosts.ts';
import type { Page } from '@playwright/test';
import { legiblePlan } from './study-fixtures.ts';

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

test.afterEach(() => {
  const db = new DatabaseSync(join(RUN_TMP, 'modules', 'study.db'));
  try {
    db.prepare('DELETE FROM plans WHERE id = ?').run('loading-geometry');
    for (const table of ['days', 'progress', 'preferences'])
      db.prepare(`DELETE FROM ${table} WHERE plan_id = ?`).run('loading-geometry');
  } finally {
    db.close();
  }
});

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
    name: 'Studio Oggi',
    url: '/desk/studio',
    query: 'study.index',
    label: 'Caricamento',
    selectors: ['[role="tablist"]', '[data-study-day]', '[data-study-day] h2', '[data-study-day] p'],
    first: '[data-study-day] > div',
  },
  {
    name: 'Studio Piano',
    url: '/desk/studio?tab=piano',
    query: 'study.index',
    label: 'Caricamento',
    selectors: ['[role="tablist"]', '[data-panel]', '[data-panel] > div:first-child', '[data-panel] fieldset button'],
    first: '[data-panel] > div:nth-child(3)',
  },
  {
    name: 'Studio Ripasso',
    url: '/desk/studio?tab=ripasso',
    query: 'study.review',
    label: 'Caricamento',
    selectors: ['[role="tablist"]', '[data-panel]', '[data-panel] > div:first-child', '[data-panel] fieldset'],
    first: '[data-panel] > :nth-child(3)',
  },
  {
    name: 'settings core',
    url: '/desk/settings/core',
    query: 'settings.core',
    label: 'Carico le impostazioni',
    selectors: ['main a[href="/desk/settings"]', 'main h2', 'main [data-panel]'],
  },
  {
    name: 'settings module',
    url: '/desk/settings/audio',
    query: 'settings.config',
    label: 'Carico le impostazioni',
    selectors: ['main a[href="/desk/settings"]', 'main h2', 'main [data-panel]'],
  },
];

for (const entry of cases) {
  test(`${entry.name} holds its position while loading`, async ({ page, pc }) => {
    if (entry.name.startsWith('Studio')) {
      const inbox = join(RUN_TMP, 'study', 'in-arrivo');
      await mkdir(inbox, { recursive: true });
      await writeFile(
        join(inbox, 'geometry.json'),
        JSON.stringify({ ...(await legiblePlan()), id: 'loading-geometry' }),
      );
      expect((await pc.post('/trpc/study.activate', { data: { name: 'geometry.json' } })).ok()).toBe(true);
    }
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
    await page.screenshot({ path: `/tmp/hub88-${entry.name.replaceAll(' ', '-').toLowerCase()}-loading.png` });
    const boxes = await Promise.all(entry.selectors.map((selector) => page.locator(selector).first().boundingBox()));
    const firstBlock = entry.first ? await skeleton.boundingBox() : null;
    release();
    await expect(skeleton).toHaveCount(0);
    for (const [index, selector] of entry.selectors.entries()) {
      const target = page.locator(selector).first();
      await expect(target).toBeVisible();
      expectStablePosition(boxes[index] ?? null, await target.boundingBox());
    }
    if (entry.first) expectStablePosition(firstBlock, await page.locator(entry.first).first().boundingBox());
  });
}

test('Studio day details hold their position while loading', async ({ page, pc }) => {
  const inbox = join(RUN_TMP, 'study', 'in-arrivo');
  await mkdir(inbox, { recursive: true });
  await writeFile(
    join(inbox, 'geometry-day.json'),
    JSON.stringify({ ...(await legiblePlan()), id: 'loading-geometry' }),
  );
  expect((await pc.post('/trpc/study.activate', { data: { name: 'geometry-day.json' } })).ok()).toBe(true);
  await page.setViewportSize({ width: 3840, height: 2160 });
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/trpc/*study.daysById*', async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto('/desk/studio?tab=piano');
  const day = page.getByRole('button', { name: /^G1 ·/ }).first();
  await expect(day).toBeVisible();
  const skeleton = day.locator('..').getByRole('status', { name: 'Caricamento' });
  await expect(skeleton).toBeVisible();
  await page.screenshot({ path: '/tmp/hub88-studio-day-loading.png' });
  const before = await skeleton.locator('..').boundingBox();
  const parentId = await skeleton.locator('../..').getAttribute('id');
  if (!parentId) throw new Error('Day detail has no id');
  release();
  await expect(skeleton).toHaveCount(0);
  const loaded = page.locator(`[id="${parentId}"] > div`).first();
  await expect(loaded).toBeVisible();
  const after = await loaded.boundingBox();
  expectStablePosition(before, after);
});
