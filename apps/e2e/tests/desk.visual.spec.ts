import { expect, test } from '@playwright/test';
import { freezePomodoro, pausedPomodoro } from './pomodoro-visual.ts';
import { chooseTheme, createFrom } from './themes.ts';
import { answerQueries } from './desktop.ts';
import { PC_URL } from './hosts.ts';

// A fixed clock and fixed answers for everything that moves: uptime, the countdown, "last seen", the random code.
const NOW = new Date('2026-11-04T12:00:00Z');
const json = (data: unknown) => [{ result: { data } }];

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await freezePomodoro(page);
  await page.clock.setFixedTime(NOW);
  await answerQueries(page, {
    // Through answerQueries: Oggi's calendar query can lead the batch health travels in, which a glob on health misses.
    health: { ok: true, uptime: 42 },
    // The day line counts today's focus sessions, which earlier specs of the same process complete.
    'pomodoro.today': [],
    'devices.list': [
      { id: 1, name: 'iPhone', createdAt: NOW.getTime() - 3_600_000, lastSeenAt: NOW.getTime() - 300_000 },
    ],
    // Other specs make local MCP calls; "Su questo PC" would show the last one.
    'agents.localCalls': [],
    'agents.localCallsToday': 0,
  });
  await page.goto('/desk');
  await expect(page.locator('[data-day-ruler]')).toBeVisible();
  const playback = page.getByRole('button', { name: 'Metti in pausa la musica', exact: true });
  await expect(playback).toBeVisible();
  await expect
    .poll(() =>
      playback.evaluate(
        (button) =>
          button.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length,
      ),
    )
    .toBe(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
});

test('the desk at 4K matches the baseline', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await expect(page.getByRole('button', { name: 'Avvia', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Uscita audio' }).getByText('80%', { exact: true })).toHaveCount(1);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-4k.png', { animations: 'disabled' });
});

test('Posta at 4K shows the inbox and reader', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk/messaggi');
  await page.getByRole('button', { name: /Offerta di colloquio/ }).click();
  await expect(page.getByText('vorremmo proporle un colloquio.', { exact: false })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-posta-4k.png', { animations: 'disabled' });
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
  await expect(page.getByRole('timer', { name: 'Tempo rimanente' }).locator(':scope > .sr-only')).toHaveText('12:30');
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
  { path: '/desk/settings', name: 'Impostazioni', file: 'desk-settings.png' },
]) {
  test(`the ${zone.name} zone matches the baseline`, async ({ page }) => {
    await page.goto(zone.path);
    await expect(page.getByRole('heading', { level: 1, name: zone.name })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    if (zone.name === 'Sistema')
      await expect(page.getByRole('group', { name: 'Monitor verticale' })).toContainText('Spento');
    if (zone.name === 'Dispositivi') await expect(page.getByText('Ultimo accesso: 5 min fa')).toBeVisible();
    if (zone.name === 'Media') {
      await expect(page.getByRole('img', { name: 'Copertina di Title' })).toBeVisible();
      await expect(page.getByRole('searchbox', { name: 'Cerca musica' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Audio: Cuffie, volume musica 100%' })).toBeVisible();
    }
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(zone.file, { animations: 'disabled' });
  });
}

test('Media search at 4K matches the baseline', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk/media');
  await page.getByRole('searchbox', { name: 'Cerca musica' }).fill('canzone');
  await expect(page.getByRole('button', { name: 'Riproduci Brano 1', exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-media-search-4k.png', { animations: 'disabled' });
});

test('Media artist at 4K matches the baseline', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk/media');
  await page.getByRole('searchbox', { name: 'Cerca musica' }).fill('canzone');
  await page.getByRole('button', { name: 'Artista', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Artista', exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-music-artist-4k.png', { animations: 'disabled' });
});

test('Media playlist at 4K matches the baseline', async ({ page, request }) => {
  const created = await request.post(`${PC_URL}/trpc/music.createPlaylist`, { data: { name: 'Mix esempio' } });
  const id = (await created.json()).result.data.id;
  try {
    await request.post(`${PC_URL}/trpc/music.addToPlaylist`, {
      data: { playlistId: id, id: 'playlist001', title: 'Brano esempio', artist: 'Artista' },
    });
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.goto('/desk/media');
    await page
      .getByRole('region', { name: 'Playlist', exact: true })
      .getByRole('button', { name: /^Mix esempio/ })
      .click();
    await expect(page.getByText('Brano esempio')).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('desk-music-playlist-4k.png', { animations: 'disabled' });
  } finally {
    await request.post(`${PC_URL}/trpc/music.deletePlaylist`, { data: { id, confirmed: true } });
  }
});

test('Dispositivi at 4K matches the baseline', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk/devices');
  await expect(page.getByText('Ultimo accesso: 5 min fa')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-devices-4k.png', { animations: 'disabled' });
});

test('the overview in paper matches the baseline', async ({ page }) => {
  await page.goto('/desk/settings/appearance');
  await chooseTheme(page, 'Chiaro');
  await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Panoramica' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-paper.png', { animations: 'disabled' });
});

test('Sistema at 4K matches the baseline', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk/system');
  await expect(page.getByRole('region', { name: 'Questo PC' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Monitor verticale' })).toContainText('Spento');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-system-4k.png', { animations: 'disabled' });
});

test('Sistema in paper matches the baseline', async ({ page }) => {
  await page.goto('/desk/settings/appearance');
  await chooseTheme(page, 'Chiaro');
  await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Sistema', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Questo PC' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Monitor verticale' })).toContainText('Spento');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-system-paper.png', { animations: 'disabled' });
});

test('Media in paper frosts the floating controls and matches the baseline', async ({ page }) => {
  await page.goto('/desk/settings/appearance');
  await chooseTheme(page, 'Chiaro');
  await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Media', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Copertina di Title' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Player musicale' })).toHaveCSS('backdrop-filter', /^blur\(/);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-media-paper.png', { animations: 'disabled' });
});

for (const theme of [
  { name: 'Muschio', id: 'moss', file: 'desk-moss.png' },
  { name: 'Pietra', id: 'stone', file: 'desk-stone.png' },
  { name: 'Notte', id: 'night', file: 'desk-night.png' },
  { name: 'Brace', id: 'ember', file: 'desk-ember.png' },
  { name: 'Laguna', id: 'lagoon', file: 'desk-lagoon.png' },
  { name: 'Caelestia', id: 'caelestia', file: 'desk-caelestia.png' },
]) {
  test(`the overview in ${theme.name} matches the baseline`, async ({ page }) => {
    await page.goto('/desk/settings/appearance');
    await chooseTheme(page, theme.name);
    await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Panoramica' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(theme.file, { animations: 'disabled' });
  });
}

test('the theme editor flags unreadable text and matches the baseline', async ({ page }) => {
  await page.goto('/desk/settings/appearance');
  await createFrom(page, 'Pietra');
  const editor = page.getByRole('form', { name: 'Nuovo tema' });
  await editor.getByRole('slider', { name: 'Contrasto', exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(editor.getByText(/serve almeno 4,5:1$/).first()).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-theme-editor.png', { animations: 'disabled' });
});

test('the overview with Netti corners and Vetro off matches the baseline', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('hub.radius', 'sharp');
    localStorage.setItem('hub.glass', 'off');
  });
  await page.goto('/desk');
  await expect(page.locator('html')).toHaveAttribute('data-radius', 'sharp');
  // Under load the cover arrived after the shot and the placeholder note was captured (step 39 verify).
  const cover = page.getByRole('img', { name: 'Copertina di Title', exact: true });
  await expect(cover).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(() => cover.evaluate((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0))
    .toBe(true);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-sharp-noglass.png', { animations: 'disabled' });
});

test('the widget board in edit mode matches the baseline', async ({ page }) => {
  await page.getByRole('button', { name: 'Modifica' }).click();
  await expect(page.getByRole('group', { name: 'Dimensione di Pomodoro' })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-widgets-edit.png', { animations: 'disabled' });
});

test('a HoldButton half way through the hold matches the baseline', async ({ page }) => {
  await page.goto('/desk/devices');
  await expect(page.getByText('Ultimo accesso: 5 min fa')).toBeVisible();
  // Timers stop, so the hold never completes; the ring is a WAAPI animation, set to half of its 800 ms.
  await page.clock.pauseAt(NOW);
  const revoke = page.getByRole('button', { name: 'Tieni premuto per revocare iPhone' });
  await revoke.hover();
  await page.mouse.down();
  await expect(revoke).toContainText('Continua a tenere');
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = 400;
    }
  });
  await expect(revoke).toHaveScreenshot('hold-button-mid-hold.png');
  await page.mouse.up();
});

test('the Pomodoro settings popover matches the baseline', async ({ page }) => {
  await page.goto('/desk/studio');
  await page.getByRole('button', { name: 'Impostazioni Pomodoro' }).click();
  await expect(page.getByRole('radio', { name: /^25 minuti di studio/ })).toBeChecked();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('desk-pomodoro-settings.png', { animations: 'disabled' });
});
