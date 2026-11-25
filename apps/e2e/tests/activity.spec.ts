import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { restoreDesktop } from './desktop.ts';
import { SERVER_URL } from './hosts.ts';
import { ballOf, underBall } from './ball.ts';

// The fake player is always playing or paused, so each test removes it first to see the idle desk.
const player = (request: APIRequestContext, gone: boolean) =>
  request.post(`${SERVER_URL}/__fake/player`, { data: { gone } });

let jobId: string | undefined;
test.afterEach(async ({ pc, request }) => {
  await pc.post('/trpc/pomodoro.stop', { data: {} });
  if (jobId) await pc.post('/trpc/jobs.cancel', { data: { jobId, confirmed: true } });
  jobId = undefined;
  await player(request, false);
  await restoreDesktop(pc);
});

async function startJob(request: APIRequestContext) {
  jobId = (await (await request.post(`${SERVER_URL}/__fake/jobs`)).json()).jobId;
}

test('the ball exists only while something runs, and its name says what', async ({ page, pc, request }) => {
  await player(request, true);
  await page.goto('/desk/media');
  await expect(page.getByRole('navigation', { name: 'Zone' })).toBeVisible();
  await expect(ballOf(page)).toHaveCount(0);
  await pc.post('/trpc/pomodoro.start', { data: {} });
  await expect(ballOf(page)).toHaveAccessibleName(/^Attività in corso: concentrazione, \d\d:\d\d$/);
  await pc.post('/trpc/pomodoro.stop', { data: {} });
  await expect(ballOf(page)).toHaveCount(0);
  await startJob(request);
  await expect(ballOf(page)).toHaveAccessibleName('Attività in corso: 1 job');
  await pc.post('/trpc/jobs.cancel', { data: { jobId, confirmed: true } });
  await expect(ballOf(page)).toHaveCount(0);
  // A playing track counts, and so does a paused one; with no player it goes away again.
  await player(request, false);
  await expect(ballOf(page)).toHaveAccessibleName('Attività in corso: Title');
  await pc.post('/trpc/media.playPause');
  await expect(ballOf(page)).toHaveAccessibleName('Attività in corso: Title');
  await player(request, true);
  await expect(ballOf(page)).toHaveCount(0);
});

test('two running jobs are counted once in the name, each is its own row', async ({ page, pc, request }) => {
  await player(request, true);
  await page.goto('/desk/media');
  await startJob(request);
  const first = jobId;
  await startJob(request);
  try {
    const ball = ballOf(page);
    await expect(ball).toHaveAccessibleName('Attività in corso: 2 job');
    await ball.click();
    const panel = page.getByRole('dialog', { name: 'Attività in corso' });
    await expect(panel.getByText('In corso', { exact: true })).toBeVisible();
    await expect(panel.getByRole('listitem')).toHaveCount(2);
  } finally {
    await pc.post('/trpc/jobs.cancel', { data: { jobId: first, confirmed: true } });
  }
});

test('the badge counts what runs, and the panel lists exactly those rows', async ({ page, pc, request }) => {
  await page.goto('/desk/media');
  await pc.post('/trpc/pomodoro.start', { data: {} });
  await startJob(request);
  const ball = ballOf(page);
  await expect(ball).toHaveAccessibleName(/^Attività in corso: concentrazione, \d\d:\d\d, 1 job, Title$/);
  await expect(ball).toHaveText(/3/);
  await expect(ball).toHaveAttribute('aria-expanded', 'false');
  await ball.click();
  await expect(ball).toHaveAttribute('aria-expanded', 'true');
  const panel = page.getByRole('dialog', { name: 'Attività in corso' });
  await expect(panel.getByRole('listitem')).toHaveCount(3);
  await expect(panel.getByRole('button', { name: 'Apri Pomodoro' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Apri fake.job' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Apri Title' })).toBeVisible();
  // Escape closes it and returns focus to the ball.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(ball).toBeFocused();
  // So does a click outside.
  await ball.click();
  await expect(panel).toBeVisible();
  await page.mouse.click(300, 600);
  await expect(panel).toHaveCount(0);
});

test('controls in a row act without navigating; the row itself goes to its page and closes the panel', async ({
  page,
  pc,
  request,
}) => {
  await page.goto('/desk/devices');
  await pc.post('/trpc/pomodoro.start', { data: {} });
  await startJob(request);
  const ball = ballOf(page);
  const panel = page.getByRole('dialog', { name: 'Attività in corso' });
  await ball.click();
  // Pomodoro: pause acts here, the page stays.
  await panel.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
  await expect(ball).toHaveAccessibleName(/concentrazione in pausa/);
  await expect(panel.getByRole('button', { name: 'Riprendi', exact: true })).toBeVisible();
  // Music: next changes the track and does not navigate.
  await panel.getByRole('button', { name: 'Brano successivo' }).click();
  await expect(panel.getByRole('button', { name: 'Apri Second Title' })).toBeVisible();
  await expect(page).toHaveURL(/\/desk\/devices$/);
  const rows: Array<[string, RegExp]> = [
    ['Apri Pomodoro', /\/desk$/],
    ['Apri fake.job', /\/desk\/system\?tab=jobs$/],
    ['Apri Second Title', /\/desk\/media$/],
  ];
  for (const [name, url] of rows) {
    await page.goto('/desk/devices');
    await ball.click();
    await panel.getByRole('button', { name }).click();
    await expect(page).toHaveURL(url);
    await expect(panel).toHaveCount(0);
  }
});

// Every focusable thing on a page, minus the ball itself, must stay clear of the ball's box.
for (const view of [
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
]) {
  test(`the ball covers no control on any page at ${view.width}x${view.height}`, async ({ page, pc }) => {
    test.slow();
    await page.setViewportSize(view);
    await pc.post('/trpc/pomodoro.start', { data: {} });
    for (const path of [
      '/desk',
      '/desk',
      '/desk/media',
      '/desk/system',
      '/desk/system?tab=jobs',
      '/desk/devices',
      '/desk/settings/appearance',
    ]) {
      await page.goto(path);
      const ball = ballOf(page);
      await expect(ball).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Zone' })).toBeVisible();
      expect(await underBall(page, ball), path).toEqual([]);
    }
  });
}

test('Modifica stays in the top right corner, on Panoramica only, whether the ball shows or not', async ({
  page,
  request,
}) => {
  await player(request, true);
  await page.goto('/desk');
  const edit = page.getByRole('button', { name: 'Modifica', exact: true });
  await expect(edit).toBeVisible();
  const idle = await edit.boundingBox();
  await request.post(`${SERVER_URL}/__fake/jobs`).then(async (r) => (jobId = (await r.json()).jobId));
  const ball = ballOf(page);
  await expect(ball).toBeVisible();
  const busy = await edit.boundingBox();
  const ballBox = await ball.boundingBox();
  expect(busy).toEqual(idle);
  // Owner 2026-11-14: the ball starts top left, above the rail; Modifica keeps the right.
  const rail = await page.getByRole('navigation', { name: 'Zone' }).boundingBox();
  expect(ballBox!.x).toBeLessThan(rail!.x + rail!.width);
  expect(ballBox!.y + ballBox!.height).toBeLessThanOrEqual(rail!.y);
  expect(busy!.x).toBeGreaterThan(ballBox!.x + ballBox!.width);
  await page.goto('/desk');
  await expect(page.getByRole('button', { name: 'Modifica', exact: true })).toHaveCount(0);
});

test('the ball is dragged anywhere, stays there after a reload, a drag does not open it and a double click puts it back', async ({
  page,
  request,
}) => {
  // The fake player is playing, so the ball shows.
  await player(request, false);
  await page.goto('/desk/media');
  const ball = ballOf(page);
  await expect(ball).toBeVisible();
  const start = (await ball.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(900, 600, { steps: 8 });
  await page.mouse.up();
  const moved = (await ball.boundingBox())!;
  expect(Math.abs(moved.x + moved.width / 2 - 900)).toBeLessThan(2);
  expect(Math.abs(moved.y + moved.height / 2 - 600)).toBeLessThan(2);
  await expect(ball).toHaveAttribute('aria-expanded', 'false');
  // Motion ends the drag a frame after the release: the spot is saved then.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hub.ball'))).not.toBeNull();
  await page.reload();
  await expect(ball).toBeVisible();
  expect((await ball.boundingBox())!.x).toBeCloseTo(moved.x, 0);
  // A plain click still opens the panel.
  await ball.click();
  await expect(ball).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await ball.dblclick();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await ball.boundingBox())!.x).toBeCloseTo(start.x, 0);
  await page.evaluate(() => localStorage.removeItem('hub.ball'));
});
