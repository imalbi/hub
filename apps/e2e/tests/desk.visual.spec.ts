import { expect, test } from '@playwright/test';
import { freezePomodoro, pausedPomodoro } from './pomodoro-visual.ts';
import { chooseTheme } from './themes.ts';

// A fixed clock and fixed answers for everything that moves: uptime, the countdown, "last seen", the random code.
const NOW = new Date('2026-11-04T12:00:00Z');
const json = (data: unknown) => [{ result: { data } }];

test.beforeEach(async ({ page }) => {
  await freezePomodoro(page);
  await page.clock.setFixedTime(NOW);
  await page.route('**/trpc/health*', (route) => route.fulfill({ json: json({ ok: true, uptime: 42 }) }));
  await page.route('**/trpc/devices.list*', (route) =>
    route.fulfill({
      json: json([
        { id: 1, name: 'iPhone', createdAt: NOW.getTime() - 3_600_000, lastSeenAt: NOW.getTime() - 300_000 },
      ]),
    }),
  );
  await page.goto('/desk');
  await expect(page.getByText('Server attivo da 42s')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
});

test('the desk at 4K matches the baseline', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await expect(page.getByRole('button', { name: 'Avvia', exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-4k.png', { animations: 'disabled' });
});

test('the idle progress ring draws no completed arc', async ({ page }) => {
  await page.goto('/desk/studio');
  await expect(page.getByRole('button', { name: 'Avvia', exact: true })).toBeVisible();
  const png = await page.locator('svg.pomodoro-ring').screenshot();
  const white = await page.evaluate(
    async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Missing canvas context');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let total = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if ((pixels[i] ?? 0) > 200 && (pixels[i + 1] ?? 0) > 200 && (pixels[i + 2] ?? 0) > 200) total++;
      return total;
    },
    `data:image/png;base64,${png.toString('base64')}`,
  );
  expect(white).toBe(0);
});

test('the paused Pomodoro panel shows its progress, remaining time and all controls', async ({ page }) => {
  await freezePomodoro(page, pausedPomodoro);
  await page.goto('/desk/studio');
  await expect(page.getByRole('timer', { name: 'Tempo rimanente' })).toHaveAccessibleDescription('12:30');
  await expect(page.getByRole('progressbar', { name: 'Avanzamento Pomodoro' })).toHaveAttribute('value', '0.5');
  await expect(page.getByRole('button', { name: 'Riprendi', exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-pomodoro-paused.png', { animations: 'disabled' });
});

test('the desk matches the baseline', async ({ page }) => {
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk.png', { animations: 'disabled' });
});

test('the desk with a pairing code matches the baseline', async ({ page }) => {
  await page.goto('/desk/devices');
  await expect(page.getByText('Ultimo accesso: 5 min fa')).toBeVisible();
  await page.route('**/trpc/pairing.createCode*', (route) =>
    route.fulfill({ json: json({ code: '123456', expiresAt: NOW.getTime() + 120_000 }) }),
  );
  await page.getByRole('button', { name: 'Genera codice' }).click();
  await expect(page.getByRole('status', { name: 'Codice di abbinamento' })).toHaveText('123456');
  await expect(page.getByText('Scade tra 120s')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-code.png', { animations: 'disabled' });
});

for (const zone of [
  { path: '/desk/studio', name: 'Studio', file: 'desk-studio.png' },
  { path: '/desk/media', name: 'Media', file: 'desk-media.png' },
  { path: '/desk/system', name: 'Sistema', file: 'desk-system.png' },
  { path: '/desk/devices', name: 'Dispositivi', file: 'desk-devices.png' },
]) {
  test(`the ${zone.name} zone matches the baseline`, async ({ page }) => {
    await page.goto(zone.path);
    await expect(page.getByRole('heading', { level: 1, name: zone.name })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    if (zone.name === 'Dispositivi') await expect(page.getByText('Ultimo accesso: 5 min fa')).toBeVisible();
    if (zone.name === 'Media') await expect(page.getByRole('img', { name: 'Copertina di Title' })).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(zone.file, { animations: 'disabled' });
  });
}

test('the overview in paper matches the baseline', async ({ page }) => {
  await page.goto('/desk/devices');
  await chooseTheme(page, 'Chiaro');
  await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Panoramica' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-paper.png', { animations: 'disabled' });
});

test('Media in paper uses solid floating controls and matches the baseline', async ({ page }) => {
  await page.goto('/desk/devices');
  await chooseTheme(page, 'Chiaro');
  await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Media', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Copertina di Title' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Player musicale' })).toHaveCSS('backdrop-filter', 'none');
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-media-paper.png', { animations: 'disabled' });
});

for (const theme of [
  { name: 'Muschio', id: 'moss', file: 'desk-moss.png' },
  { name: 'Pietra', id: 'stone', file: 'desk-stone.png' },
  { name: 'Caelestia', id: 'caelestia', file: 'desk-caelestia.png' },
]) {
  test(`the overview in ${theme.name} matches the baseline`, async ({ page }) => {
    await page.goto('/desk/devices');
    await chooseTheme(page, theme.name);
    await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Panoramica' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(theme.file, { animations: 'disabled' });
  });
}

test('the theme editor flags unreadable text and matches the baseline', async ({ page }) => {
  await page.goto('/desk/devices');
  await page.getByRole('button', { name: 'Duplica Pietra' }).click();
  const editor = page.getByRole('form', { name: 'Nuovo tema' });
  const surface = await editor.getByLabel('Pannelli', { exact: true }).inputValue();
  await editor.getByLabel('Testo secondario', { exact: true }).fill(surface);
  await expect(editor.getByText(/^Testo secondario su Pannelli/)).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page.getByRole('region', { name: 'Aspetto' })).toHaveScreenshot('desk-theme-editor.png', {
    animations: 'disabled',
  });
});
