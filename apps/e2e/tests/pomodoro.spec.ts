import type { Page } from '@playwright/test';
import { DECK_STATE, PHONE_URL } from './hosts.ts';
import { expect, test } from './fixtures.ts';
import { freezePomodoro, pausedPomodoro } from './pomodoro-visual.ts';

test.beforeEach(async ({ pc }) => {
  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: [{ widget: 'pomodoro', size: 'large', x: 0, y: 0 }] },
  });
});
test.afterEach(async ({ pc }) => {
  await pc.post('/trpc/layout.reset', { data: { zone: 'overview' } });
});

test('settled timer digits share the same text top at the desk scale', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await freezePomodoro(page, { ...pausedPomodoro, pausedRemainingMs: 45 * 60_000 });
  await page.goto('/desk');
  const timer = page.getByRole('timer', { name: 'Tempo rimanente' });
  await expect(timer.locator(':scope > .sr-only')).toHaveText('45:00');
  const tops = await timer.evaluate((element) => {
    const digits = [...element.querySelectorAll<HTMLElement>('span.relative.inline-block')].slice(0, 2);
    return digits.map((digit) => {
      const visible = [...digit.children].find((child) => getComputedStyle(child).visibility === 'visible');
      if (!visible || !visible.firstChild) throw new Error('Missing visible digit');
      const range = document.createRange();
      const transform = getComputedStyle(visible).transform;
      const offset =
        transform === 'none' ? 0 : Math.round(-new DOMMatrixReadOnly(transform).m42 / (visible.clientHeight / 50));
      range.setStart(visible.firstChild, offset * 2);
      range.setEnd(visible.firstChild, offset * 2 + 1);
      return { top: range.getBoundingClientRect().top, inFlow: getComputedStyle(visible).position !== 'absolute' };
    });
  });
  expect(tops).toHaveLength(2);
  expect(Math.abs(tops[0].top - tops[1].top)).toBeLessThan(0.01);
  await timer.evaluate((element) => {
    element.style.color = 'white';
    element.style.background = 'black';
  });
  const pixels: number[] = [];
  for (const digit of await timer.locator('span.relative.inline-block').all()) {
    if (pixels.length === 2) break;
    const png = await digit.screenshot();
    pixels.push(
      await page.evaluate(async (data) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(img, 0, 0);
        const rgba = ctx.getImageData(0, 0, img.width, img.height).data;
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            if (rgba[(y * img.width + x) * 4] > 128) return y;
          }
        }
        throw new Error('Digit pixels missing');
      }, png.toString('base64')),
    );
  }
  expect(pixels[0]).toBe(pixels[1]);
  expect(tops.map((digit) => digit.inFlow)).toEqual([true, true]);
});

test('a changing digit shows its strip only until the roll settles', async ({ page }) => {
  await page.goto('/desk');
  await page.getByRole('button', { name: 'Avvia', exact: true }).click();
  const timer = page.getByRole('timer', { name: 'Tempo rimanente' });
  const digits = timer.locator('span.relative.inline-block');
  await expect
    .poll(() =>
      digits.evaluateAll((elements) =>
        elements.some(
          (digit) =>
            getComputedStyle(digit.children[1]).visibility === 'visible' &&
            getComputedStyle(digit.children[0]).visibility === 'hidden',
        ),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
  await expect
    .poll(() =>
      digits.evaluateAll((elements) =>
        elements.every(
          (digit) =>
            getComputedStyle(digit.children[1]).visibility === 'hidden' &&
            getComputedStyle(digit.children[0]).visibility === 'visible',
        ),
      ),
    )
    .toBe(true);
});

test('reduced motion keeps the digits in flow after a value changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/desk');
  await page.getByRole('button', { name: 'Avvia', exact: true }).click();
  const timer = page.getByRole('timer', { name: 'Tempo rimanente' });
  await expect(timer.locator(':scope > .sr-only')).toHaveText('00:05');
  const digits = timer.locator('span.relative.inline-block');
  expect(
    await digits.evaluateAll((elements) =>
      elements.every(
        (digit) =>
          getComputedStyle(digit.children[1]).visibility === 'hidden' &&
          getComputedStyle(digit.children[0]).visibility === 'visible',
      ),
    ),
  ).toBe(true);
});

type TimerFrame = { text: string; rolling: boolean };

/** Notes on every frame the desk timer's readable time and whether any of its digits is rolling (a transform transition). */
async function recordTimerFrames(page: Page) {
  await page.addInitScript(() => {
    const frames: Array<{ text: string; rolling: boolean }> = [];
    Reflect.set(window, 'timerFrames', frames);
    const note = () => {
      const timer = document.querySelector('[role="timer"]');
      if (timer)
        frames.push({
          text: timer.querySelector(':scope > .sr-only')?.textContent ?? '',
          rolling: timer
            .getAnimations({ subtree: true })
            .some((animation) => animation instanceof CSSTransition && animation.transitionProperty === 'transform'),
        });
      requestAnimationFrame(note);
    };
    requestAnimationFrame(note);
  });
  return () => page.evaluate<TimerFrame[]>(() => Reflect.get(window, 'timerFrames'));
}

test.afterEach(async ({ pc }) => {
  const response = await pc.get('/trpc/pomodoro.state');
  if (!(await response.text()).includes('"phase":"idle"')) await pc.post('/trpc/pomodoro.stop', { data: {} });
});

// The digits roll when the number changes. Arriving at the page is not a change: the first real value appears still,
// instead of rolling in from the 00:00 shown before the state has arrived.
test('the timer shows its first real value without rolling in from 00:00', async ({ page }) => {
  await freezePomodoro(page, pausedPomodoro);
  const frames = await recordTimerFrames(page);
  await page.goto('/desk');
  await expect(page.getByRole('timer', { name: 'Tempo rimanente' }).locator(':scope > .sr-only')).toHaveText('12:30');
  // A roll would start within a frame or two of the value arriving; look at the next twenty.
  await expect.poll(async () => (await frames()).filter((frame) => frame.text === '12:30').length).toBeGreaterThan(20);
  expect((await frames()).some((frame) => frame.rolling)).toBe(false);
});

test('a later change still rolls the digits', async ({ page, pc }) => {
  await pc.post('/trpc/pomodoro.start', { data: {} });
  const frames = await recordTimerFrames(page);
  await page.goto('/desk');
  // The first real value, then a tick of the clock: the seconds digit changes and rolls.
  await expect
    .poll(async () => {
      const seen = await frames();
      const first = seen.findIndex((frame) => frame.text !== '' && frame.text !== '00:00');
      const changed = seen.findIndex((frame, index) => first >= 0 && index > first && frame.text !== seen[first]?.text);
      return changed > 0 && seen.slice(changed).some((frame) => frame.rolling);
    })
    .toBe(true);
});

test('deck taps start, pause and resume the timer shown on the desk', async ({ page, browser }) => {
  const phone = await browser.newContext({ storageState: DECK_STATE, viewport: { width: 375, height: 812 } });
  try {
    const deck = await phone.newPage();
    await page.goto('/desk');
    await deck.goto(`${PHONE_URL}/deck`);
    const tile = deck.getByRole('button', { name: /^Pomodoro:/ });
    await expect(tile).toHaveAccessibleName(/Pronto/);
    await tile.click();
    await expect(tile).toHaveAccessibleName(/Studio/);
    await expect(page.getByRole('button', { name: 'Metti in pausa', exact: true })).toBeVisible();
    await expect
      .poll(async () => {
        const time = await page
          .getByRole('timer', { name: 'Tempo rimanente' })
          .locator(':scope > .sr-only')
          .innerText();
        return (await tile.getAttribute('aria-label'))?.includes(time);
      })
      .toBe(true);
    await tile.click();
    await expect(tile).toHaveAccessibleName(/in pausa/);
    await expect(page.getByRole('button', { name: 'Riprendi', exact: true })).toBeVisible();
    const remaining = await page
      .getByRole('timer', { name: 'Tempo rimanente' })
      .locator(':scope > .sr-only')
      .innerText();
    if (!remaining) throw new Error('Timer must expose its remaining time');
    await expect(tile).toHaveAccessibleName(new RegExp(remaining));
    await deck.clock.install();
    await deck.clock.fastForward(10_000);
    await expect(tile).toHaveAccessibleName(new RegExp(remaining));
    await tile.click();
    await expect(page.getByRole('button', { name: 'Metti in pausa', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Salta', exact: true }).click();
    await expect(tile).toHaveAccessibleName(/Pomodoro: Pausa /);
    await page.getByRole('button', { name: 'Ferma', exact: true }).click();
    await expect(tile).toHaveAccessibleName(/Pronto/);
  } finally {
    await phone.close();
  }
});

test('a real short phase ends, pushes the break and adds a completed focus today', async ({ page }) => {
  await page.goto('/desk');
  const count = page.getByText(/Sessioni completate oggi:/);
  const before = Number((await count.innerText()).split(':').at(-1)?.trim());
  await page.getByRole('button', { name: 'Avvia', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Avanzamento Pomodoro' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Pomodoro', exact: true }).getByText('Pausa', { exact: true }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(count).toHaveText(`Sessioni completate oggi: ${before + 1}`);
  await page.getByRole('button', { name: 'Salta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Avvia', exact: true })).toBeVisible();
});

const timeText = (page: Page) => page.getByRole('timer', { name: 'Tempo rimanente' }).locator(':scope > .sr-only');

test('the countdown shows every second exactly once', async ({ page }) => {
  await page.clock.install();
  await page.goto('/desk');
  await page.getByRole('button', { name: 'Avvia', exact: true }).click();
  await expect(timeText(page)).toHaveText('00:06');
  await timeText(page).evaluate((element) => {
    const seen: string[] = [];
    Object.assign(window, { seenTimes: seen });
    new MutationObserver(() => seen.push(element.textContent ?? '')).observe(element, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  });
  for (let second = 0; second < 5; second++) await page.clock.runFor(1000);
  expect(await page.evaluate(() => Reflect.get(window, 'seenTimes'))).toEqual([
    '00:05',
    '00:04',
    '00:03',
    '00:02',
    '00:01',
  ]);
});

test('a client whose clock is an hour off still shows the server time left', async ({ page }) => {
  await page.clock.install({ time: Date.now() + 3_600_000 });
  await page.goto('/desk');
  await page.getByRole('button', { name: 'Avvia', exact: true }).click();
  // Counting with its own clock it would read 00:00 at once.
  await expect(timeText(page)).toHaveText(/^00:0[1-6]$/);
});

test('the settings popover switches the preset and the sound', async ({ page, pc }) => {
  const fixture = { focusMinutes: 0.1, shortBreakMinutes: 0.05, longBreakMinutes: 0.1, longBreakEvery: 4, sound: true };
  const state = async () => (await pc.get('/trpc/pomodoro.state')).text();
  try {
    await page.goto('/desk');
    const gear = page.getByRole('button', { name: 'Impostazioni Pomodoro' });
    await gear.click();
    const popover = page.getByRole('dialog', { name: 'Impostazioni Pomodoro' });
    // Owner 2026-11-14: the panel hangs from the gear, not from the middle of the screen.
    await expect(popover).toBeVisible();
    const button = (await gear.boundingBox())!;
    // The panel slides in a few pixels: wait for it to land under the gear, then check it hangs from it.
    await expect.poll(async () => (await popover.boundingBox())!.y).toBeGreaterThanOrEqual(button.y + button.height);
    const panel = (await popover.boundingBox())!;
    expect(panel.y - (button.y + button.height)).toBeLessThan(32);
    expect(Math.abs(panel.x + panel.width - (button.x + button.width))).toBeLessThan(2);
    await popover.getByText('50/10', { exact: true }).click();
    await expect(popover.getByRole('radio', { name: /^50 minuti di studio/ })).toBeChecked();
    await expect
      .poll(state)
      .toContain('"focusMinutes":50,"shortBreakMinutes":10,"longBreakMinutes":15,"longBreakEvery":0');
    await popover.getByRole('switch', { name: 'Suono a fine fase' }).click();
    await expect.poll(state).toContain('"sound":false');
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
  } finally {
    await pc.post('/trpc/pomodoro.configure', { data: fixture, headers: { 'content-type': 'application/json' } });
  }
});

/** The digits the rolling strips actually show (each strip's offset picks one character of its column). */
function shownDigits(page: Page) {
  return page.getByRole('timer', { name: 'Tempo rimanente' }).evaluate((timer) => {
    // Each NumberRoll digit shows its in-flow digit at rest and its strip only while rolling: read whichever is visible.
    const digits = [...timer.querySelectorAll<HTMLElement>('span.relative.inline-block')].map((cell) => {
      const flow = cell.querySelector<HTMLElement>(':scope > span:first-child');
      const strip = cell.querySelector<HTMLElement>(':scope > span[aria-hidden="true"]');
      if (!flow || !strip) return '?';
      if (getComputedStyle(flow).visibility === 'visible') return flow.textContent ?? '?';
      const chars = (strip.textContent ?? '').replaceAll(/\s/g, '');
      const step = strip.offsetHeight / chars.length;
      const offset = -new DOMMatrixReadOnly(getComputedStyle(strip).transform).m42;
      return chars[Math.round(offset / step)] ?? '?';
    });
    return `${digits.slice(0, 2).join('')}:${digits.slice(2, 4).join('')}`;
  });
}

// Plan 19: a view mounted again mid-session showed the full duration (25:00) instead of the time left.
for (const [paused, via] of [
  [false, 'Media'],
  [true, 'Media'],
  [false, 'Panoramica'],
] as const)
  test(`a Pomodoro view mounted again mid-session shows the time left${paused ? ' (paused)' : ''}, via ${via}`, async ({
    page,
    pc,
  }) => {
    const fixture = {
      focusMinutes: 0.1,
      shortBreakMinutes: 0.05,
      longBreakMinutes: 0.1,
      longBreakEvery: 4,
      sound: true,
    };
    const json = { headers: { 'content-type': 'application/json' } };
    try {
      await pc.post('/trpc/pomodoro.configure', { data: { ...fixture, focusMinutes: 25 }, ...json });
      await page.goto('/desk');
      await page.getByRole('button', { name: 'Avvia', exact: true }).click();
      await expect(timeText(page)).toHaveText(/^24:5\d$/);
      await page.waitForTimeout(2500);
      if (paused) {
        await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Riprendi', exact: true })).toBeVisible();
      }
      const before = await timeText(page).textContent();
      const rail = page.getByRole('navigation', { name: 'Zone' });
      await rail.getByRole('link', { name: via, exact: true }).click();
      await expect(page).toHaveURL(via === 'Media' ? /\/desk\/media$/ : /\/desk$/);
      // Panoramica has its own Pomodoro panel: read it there; otherwise come back to Studio.
      if (via === 'Media') await rail.getByRole('link', { name: 'Panoramica', exact: true }).click();
      // Until the first push the hidden text is the 00:00 placeholder, and the session is at 24:5x: wait for the push.
      await expect(timeText(page)).toHaveText(/^(?!00:00)\d\d:\d\d$/);
      const after = await timeText(page).textContent();
      expect(after).not.toBe('25:00');
      // What the owner sees are the rolling digits, not the screen reader text: once they settle they must agree.
      await expect.poll(() => shownDigits(page), { timeout: 5000 }).toBe(await timeText(page).textContent());
      // Paused, the time is frozen; running, it has gone on by at most a few seconds.
      const secondsOf = (text: string | null) => Number(text?.slice(0, 2)) * 60 + Number(text?.slice(3));
      const gone = secondsOf(before) - secondsOf(after);
      expect(gone).toBeGreaterThanOrEqual(0);
      expect(gone).toBeLessThanOrEqual(paused ? 0 : 5);
    } finally {
      await pc.post('/trpc/pomodoro.configure', { data: fixture, ...json });
    }
  });

// Owner's steps (plan 19): start, wait until the minutes have changed elsewhere, then open Studio.
test('Studio opened after the minute changed elsewhere shows the time left', async ({ page, pc }) => {
  const fixture = { focusMinutes: 0.1, shortBreakMinutes: 0.05, longBreakMinutes: 0.1, longBreakEvery: 4, sound: true };
  const json = { headers: { 'content-type': 'application/json' } };
  try {
    // 1:06, so the minutes go from 01 to 00 a few seconds in.
    await pc.post('/trpc/pomodoro.configure', { data: { ...fixture, focusMinutes: 1.1 }, ...json });
    await page.goto('/desk/media');
    await pc.post('/trpc/pomodoro.start', { data: {} });
    await page.waitForTimeout(8000);
    await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Panoramica', exact: true }).click();
    await expect(timeText(page)).toHaveText(/^00:5\d$/);
    await expect.poll(() => shownDigits(page), { timeout: 5000 }).toBe(await timeText(page).textContent());
  } finally {
    await pc.post('/trpc/pomodoro.configure', { data: fixture, ...json });
  }
});
