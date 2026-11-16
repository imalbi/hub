import { contrastRatio } from './contrast.ts';
import { expect, test } from './fixtures.ts';
import { restoreDesktop } from './desktop.ts';
import { freezePomodoro, pausedPomodoro } from './pomodoro-visual.ts';
import { chooseTheme } from './themes.ts';

const zones = [
  ['Panoramica', '/desk'],
  ['Studio', '/desk/studio'],
  ['Media', '/desk/media'],
  ['Sistema', '/desk/system'],
  ['Dispositivi', '/desk/devices'],
  ['Messaggi', '/desk/messaggi'],
  ['Calendario', '/desk/calendar'],
  // Impostazioni opens on Aspetto (step 63): the rail link goes to the index, which replaces itself.
  ['Impostazioni', '/desk/settings/appearance'],
];

test('the rail navigates every zone and marks exactly the active destination', async ({ page }) => {
  await page.goto('/desk');
  const rail = page.getByRole('navigation', { name: 'Zone' });
  for (const [name, path] of zones) {
    await rail.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}/?$`));
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    await expect(rail.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(rail.locator('[aria-current="page"]')).toHaveCount(1);
  }
});

test('every desk page has exactly one h1 and it is visually hidden', async ({ page }) => {
  for (const [name, path] of zones) {
    await page.goto(path);
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toHaveCount(1);
    await expect(title).toHaveText(name);
    const box = await title.boundingBox();
    expect(box && box.width <= 1 && box.height <= 1).toBe(true);
  }
});

test('the rail keeps the active link style and aria-current when the URL has search parameters', async ({ page }) => {
  await page.goto('/desk/studio?segment=favorites');
  const rail = page.getByRole('navigation', { name: 'Zone' });
  const studioLink = rail.getByRole('link', { name: 'Studio', exact: true });
  await expect(studioLink).toHaveAttribute('aria-current', 'page');
  await expect(studioLink).toHaveClass(/text-primary-foreground/);
});

test('number keys switch zones but do not interfere with typing or modified shortcuts', async ({ page }) => {
  await page.goto('/desk/studio');
  await expect(page.getByRole('heading', { level: 1, name: 'Studio' })).toBeVisible();
  for (let i = 0; i < zones.length; i++) {
    await page.keyboard.press(String(i + 1));
    await expect(page).toHaveURL(new RegExp(`${zones[i]?.[1]}/?$`));
  }
  await page.keyboard.press('Control+1');
  await expect(page).toHaveURL(/\/desk\/settings\/appearance$/);
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Campo di prova');
    document.querySelector('main')?.append(input);
  });
  await page.getByRole('textbox', { name: 'Campo di prova' }).focus();
  await page.keyboard.press('1');
  await expect(page.getByRole('textbox', { name: 'Campo di prova' })).toHaveValue('1');
  await expect(page).toHaveURL(/\/desk\/settings\/appearance$/);
  await page.getByRole('button', { name: 'Cerca o esegui, scorciatoia Ctrl K' }).focus();
  await page.keyboard.press('1');
  await expect(page).toHaveURL(/\/desk\/?$/);
});

test('Media controls playback and Sistema switches outputs', async ({ page, pc }) => {
  try {
    await restoreDesktop(pc);
    await page.goto('/desk/media');
    await page.getByRole('button', { name: 'Metti in pausa la musica', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Riproduci musica', exact: true })).toBeVisible();
    await page.goto('/desk/system');
    const outputs = page.getByRole('main').getByRole('toolbar', { name: 'Uscite configurate' });
    await expect(outputs.getByRole('button', { name: 'Cuffie' })).toHaveAttribute('aria-pressed', 'true');
    await outputs.getByRole('button', { name: 'Casse' }).click();
    await expect(outputs.getByRole('button', { name: 'Casse' })).toHaveAttribute('aria-pressed', 'true');
    await expect(outputs.getByRole('button', { name: 'Cuffie' })).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await restoreDesktop(pc);
  }
});

test('a chosen theme survives reload and the deck follows it', async ({ page }) => {
  await page.goto('/desk/settings/appearance');
  await chooseTheme(page, 'Chiaro');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await expect(page.getByRole('radio', { name: 'Chiaro', exact: true })).toBeChecked();
  // The theme is a per-device choice since step 07c: the deck on the same browser uses it too, even unpaired.
  await page.goto('/deck');
  await expect(page.getByRole('heading', { name: 'Abbina questo dispositivo' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
});

test('Pomodoro secondary controls remain readable when hovered in paper', async ({ page }) => {
  await freezePomodoro(page, pausedPomodoro);
  await page.goto('/desk/settings/appearance');
  await chooseTheme(page, 'Chiaro');
  await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Studio', exact: true }).click();
  for (const name of ['Salta', 'Ferma']) {
    const button = page.getByRole('button', { name, exact: true });
    await button.hover();
    const ratio = await contrastRatio(button);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});

test('Sistema volume follows a second client and can be changed from the slider', async ({ page, pc }) => {
  try {
    await page.goto('/desk/system');
    const slider = page.getByRole('slider', { name: 'Volume' });
    await expect(slider).toHaveValue('80');
    const response = await pc.post('/trpc/audio.setVolume', { data: { value: 0.45 } });
    expect(response.ok()).toBe(true);
    await expect(slider).toHaveValue('45');
    await slider.focus();
    await slider.press('End');
    await expect.poll(async () => (await (await pc.get('/trpc/audio.state')).json()).result.data.volume).toBe(1);
  } finally {
    await pc.post('/trpc/audio.setVolume', { data: { value: 0.8 } });
  }
});

test('dragging the Sistema volume slider writes once, on release, with the final value', async ({ page, pc }) => {
  try {
    await page.goto('/desk/system');
    const slider = page.getByRole('slider', { name: 'Volume' });
    await expect(slider).toHaveValue('80');
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('audio.setVolume')) writes.push(request.postData() ?? '');
    });
    await slider.scrollIntoViewIfNeeded();
    const box = await slider.boundingBox();
    if (!box) throw new Error('slider has no box');
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.8, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, y, { steps: 10 });
    await expect(slider).not.toHaveValue('80');
    expect(writes).toEqual([]);
    await page.mouse.up();
    await expect.poll(() => writes.length).toBe(1);
    const final = Number(await slider.inputValue()) / 100;
    await expect.poll(async () => (await (await pc.get('/trpc/audio.state')).json()).result.data.volume).toBe(final);
  } finally {
    await pc.post('/trpc/audio.setVolume', { data: { value: 0.8 } });
  }
});

test('the audio widget shows live volume from a second client', async ({ page, pc }) => {
  try {
    await page.goto('/desk');
    const widget = page.getByRole('region', { name: 'Uscita audio' });
    await expect(widget.getByText('80%', { exact: true })).toHaveCount(1);
    expect((await pc.post('/trpc/audio.setVolume', { data: { value: 0.55 } })).ok()).toBe(true);
    await expect(widget.getByText('55%', { exact: true })).toHaveCount(1);
  } finally {
    await pc.post('/trpc/audio.setVolume', { data: { value: 0.8 } });
  }
});

test('audio widget keeps its output selector inside its bounds', async ({ page }) => {
  await page.goto('/desk');
  const widget = page.getByRole('region', { name: 'Uscita audio' });
  const selector = widget.getByRole('toolbar', { name: 'Uscite configurate' });
  await expect(selector).toBeVisible();
  const fits = await widget.evaluate((panel) => {
    const toolbar = panel.querySelector('[role="toolbar"]');
    if (!toolbar) return false;
    return toolbar.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom;
  });
  expect(fits).toBe(true);
});
