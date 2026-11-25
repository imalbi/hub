import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

const json = { 'content-type': 'application/json' };
const cell = (page: Page, id: string) => page.locator(`[data-widget="${id}"]`);
const panel = (page: Page, id: string) => cell(page, id).locator('section').first();

async function place(
  pc: APIRequestContext,
  items: Array<{ widget: string; size: 'small' | 'medium' | 'large'; x: number; y: number }>,
) {
  await pc.post('/trpc/layout.save', { data: { zone: 'overview', items }, headers: json });
}

async function expectFits(page: Page, id: string, label: string) {
  const card = panel(page, id);
  await expect
    .poll(() => card.evaluate((el) => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth), {
      message: label,
    })
    .toBe(true);
}

test.afterEach(async ({ pc }) => {
  await pc.post('/trpc/layout.reset', { data: { zone: 'overview' }, headers: json });
});

test('C2: Pomodoro aligns Piccolo and Medio with live tag and fits at 4K and 1080p', async ({ page, pc }) => {
  try {
    await place(pc, [{ widget: 'pomodoro', size: 'small', x: 0, y: 0 }]);
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.goto('/desk');
    const small = panel(page, 'pomodoro');
    await expect(small.getByText('Pronto', { exact: true })).toBeVisible();
    await expect(small.getByText(/^\d+ session[ie] oggi$/)).toBeVisible();
    await expect(small.locator('[data-readout]')).toHaveText('00:00');
    expect(await small.getByRole('button').count()).toBeLessThanOrEqual(1);
    await expectFits(page, 'pomodoro', 'pomodoro small 4K');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expectFits(page, 'pomodoro', 'pomodoro small 1080p');
    await expect(small.getByRole('link')).toHaveCount(0);

    await place(pc, [{ widget: 'pomodoro', size: 'medium', x: 0, y: 0 }]);
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.goto('/desk');
    const medium = panel(page, 'pomodoro');
    await expect(medium.getByRole('button', { name: 'Impostazioni Pomodoro' })).toBeVisible();
    await expect(medium.getByText('Su cosa', { exact: true })).toBeVisible();
    await expect(medium.getByText('Sessione libera', { exact: true })).toBeVisible();
    await expect(medium.getByText(/^Studio oggi: \d+ min$/)).toBeVisible();
    await expect(medium.getByRole('progressbar', { name: 'Avanzamento Pomodoro' })).toBeAttached();
    await expectFits(page, 'pomodoro', 'pomodoro medium idle 4K');

    await pc.post('/trpc/pomodoro.startTagged', { data: { tag: 'study/Chimica/G3' }, headers: json });
    await expect(medium.getByText('Chimica · G3', { exact: true })).toBeVisible();
    await expect(medium.getByRole('button', { name: 'Salta', exact: true })).toBeVisible();
    await expect(medium.getByRole('button', { name: 'Ferma', exact: true })).toBeVisible();
    await expect(medium.getByRole('button', { name: 'Metti in pausa', exact: true })).toBeVisible();
    await expectFits(page, 'pomodoro', 'pomodoro medium active 4K');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expectFits(page, 'pomodoro', 'pomodoro medium active 1080p');
  } finally {
    const response = await pc.get('/trpc/pomodoro.state');
    if (!(await response.text()).includes('"phase":"idle"')) await pc.post('/trpc/pomodoro.stop', { data: {} });
  }
});

test('C2: Musica aligns Piccolo, Medio, and Grande with seek at 4K and 1080p', async ({ page, pc }) => {
  await place(pc, [{ widget: 'media', size: 'small', x: 0, y: 0 }]);
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk');
  const small = panel(page, 'media');
  await expect(small.getByText('in riproduzione', { exact: true })).toBeVisible();
  await expect(small.getByText('Title', { exact: true })).toBeVisible();
  await expect(small.getByText('Artist', { exact: true })).toBeVisible();
  expect(await small.getByRole('button').count()).toBeLessThanOrEqual(1);
  await expectFits(page, 'media', 'media small 4K');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expectFits(page, 'media', 'media small 1080p');
  await small.getByRole('link', { name: 'Apri Media', exact: true }).click();
  await expect(page).toHaveURL(/\/desk\/media$/);

  await place(pc, [{ widget: 'media', size: 'medium', x: 0, y: 0 }]);
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk');
  const medium = panel(page, 'media');
  await expect(medium.getByRole('img', { name: 'Copertina di Title', exact: true })).toBeVisible();
  await expect(medium.getByRole('slider', { name: 'Posizione del brano' })).toBeVisible();
  await expect(medium.getByRole('button', { name: 'Brano precedente', exact: true })).toBeVisible();
  await expect(medium.getByRole('button', { name: 'Brano successivo', exact: true })).toBeVisible();
  await expect(medium.getByRole('link', { name: 'Apri Media', exact: true })).toHaveAttribute('href', '/desk/media');
  await expectFits(page, 'media', 'media medium 4K');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expectFits(page, 'media', 'media medium 1080p');

  await place(pc, [{ widget: 'media', size: 'large', x: 0, y: 0 }]);
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk');
  const large = panel(page, 'media');
  await expect(large.getByRole('slider', { name: 'Posizione del brano' })).toBeVisible();
  await expect(large.getByText('0:12', { exact: true }).last()).toBeVisible();
  await expect(large.getByText('3:33', { exact: true })).toBeVisible();
  await expect(large.getByText('Prossimi', { exact: true })).toHaveCount(0);
  await expectFits(page, 'media', 'media large 4K');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expectFits(page, 'media', 'media large 1080p');
});

test('C2: Uscita audio Piccolo puts volume in header and output + switch on the bottom row', async ({ page, pc }) => {
  await place(pc, [{ widget: 'audio', size: 'small', x: 0, y: 0 }]);
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk');
  const small = panel(page, 'audio');
  await expect(small.locator('[data-readout] .sr-only')).toHaveText('80%');
  await expect(small.getByRole('paragraph').getByText('Cuffie', { exact: true })).toBeVisible();
  await expect(small.getByRole('button', { name: 'Cuffie', exact: true })).toBeVisible();
  await expect(small.getByRole('button', { name: 'Casse', exact: true })).toBeVisible();
  await expectFits(page, 'audio', 'audio small 4K');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expectFits(page, 'audio', 'audio small 1080p');
  await small.getByRole('link', { name: 'Apri Sistema', exact: true }).click();
  await expect(page).toHaveURL(/\/desk\/system$/);
});

test('C2: Consumo and Server Piccolo follow P3 and fit at 4K and 1080p', async ({ page, pc }) => {
  await place(pc, [
    { widget: 'power', size: 'small', x: 0, y: 0 },
    { widget: 'server', size: 'small', x: 3, y: 0 },
  ]);
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk');

  const power = panel(page, 'power');
  await expect(power.getByText('0,15 kWh oggi', { exact: true })).toBeVisible();
  await expect(power.locator('[data-readout]')).toHaveText('212 W');
  await expect(power.getByText('adesso', { exact: true })).toBeVisible();
  expect(await power.getByRole('button').count()).toBe(0);
  await expectFits(page, 'power', 'power small 4K');

  const server = panel(page, 'server');
  await expect(server.getByText('attivo', { exact: true })).toBeVisible();
  await expect(server.locator('[data-readout]')).toBeVisible();
  await expect(server.getByText("dall'ultimo avvio", { exact: true })).toBeVisible();
  expect(await server.getByRole('button').count()).toBe(0);
  await expectFits(page, 'server', 'server small 4K');

  await page.setViewportSize({ width: 1920, height: 1080 });
  await expectFits(page, 'power', 'power small 1080p');
  await expectFits(page, 'server', 'server small 1080p');

  await power.getByRole('link', { name: 'Apri Sistema', exact: true }).click();
  await expect(page).toHaveURL(/\/desk\/system$/);
});
