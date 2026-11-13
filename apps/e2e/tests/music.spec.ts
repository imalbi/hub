import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { answerQueries, restoreDesktop } from './desktop.ts';

test.afterEach(async ({ pc }) => restoreDesktop(pc));

test('player exposes position and seeks with the keyboard', async ({ page }) => {
  await page.goto('/desk/media');
  const player = page.getByRole('region', { name: 'Player musicale' });
  const slider = player.getByRole('slider', { name: 'Posizione del brano' });
  await expect(slider).toHaveAttribute('aria-valuetext', '0:12');
  await slider.focus();
  const request = page.waitForRequest((r) => r.url().includes('media.seek') && r.method() === 'POST');
  await slider.press('ArrowRight');
  expect((await request).postData()).toContain('13');
  await expect(slider).toHaveAttribute('aria-valuetext', '0:13');
});

test('seek bar keeps keyboard focus after a click while the seek is slow', async ({ page }) => {
  // Regression (owner, 2026-11-11): a click seeked, then the arrows did nothing. The slider was disabled while the
  // seek was pending, which took focus away from it.
  await page.route('**/trpc/media.seek**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.goto('/desk/media');
  const slider = page
    .getByRole('region', { name: 'Player musicale' })
    .getByRole('slider', { name: 'Posizione del brano' });
  await expect(slider).toBeVisible();
  const box = await slider.boundingBox();
  if (!box) throw new Error('slider not laid out');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(slider).toBeFocused();
  await page.waitForTimeout(100);
  await expect(slider).toBeFocused();
  const second = page.waitForRequest((r) => r.url().includes('media.seek') && r.method() === 'POST');
  await page.keyboard.press('ArrowRight');
  await second;
});

const search = (page: Page, text = 'canzone') => page.getByRole('searchbox', { name: 'Cerca musica' }).fill(text);
const library = (page: Page) => page.getByRole('region', { name: 'Playlist', exact: true });
const played = (page: Page) =>
  page.waitForResponse((response) => response.url().includes('music.play') && response.request().method() === 'POST');

async function holdDelete(page: Page) {
  await page.getByRole('button', { name: 'Tieni premuto per eliminare playlist' }).focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(900);
  await page.keyboard.up('Space');
}

test('artist opens from a row, plays a top song and returns to its source', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk/media');
  await search(page);
  await page.getByRole('button', { name: 'Artista', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Artista', exact: true })).toBeVisible();
  await expect(page.getByText('Disco esempio', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Artista' }).locator('img')).toHaveCount(2);
  const done = played(page);
  await page.getByRole('button', { name: 'Riproduci Brano artista' }).click();
  await done;
  await page.getByRole('button', { name: 'Torna indietro' }).click();
  await expect(page.getByRole('button', { name: 'Riproduci Brano 1', exact: true })).toBeVisible();
});

test('artist opened from radio returns to radio, and from the player', async ({ page }) => {
  await page.goto('/desk/media');
  await search(page);
  await page.getByRole('button', { name: 'Riproduci Brano 1', exact: true }).click();
  await page.getByRole('button', { name: 'Ascolta', exact: true }).click();
  await page
    .getByRole('region', { name: 'Prossimi' })
    .getByRole('button', { name: 'Artista', exact: true })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Artista', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Torna indietro' }).click();
  await expect(page.getByRole('region', { name: 'Prossimi' })).toBeVisible();
});

test('search, play, skip in the queue and a fixed search while results scroll', async ({ page }) => {
  // 4K, the desk's real size: the lists must really scroll here, or the check on the search box proves nothing.
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk/media');
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Player musicale' })).toBeVisible();
  await search(page);
  await expect(page.getByRole('button', { name: 'Riproduci Brano 1', exact: true })).toBeVisible();
  const request = page.waitForRequest((r) => r.url().includes('music.play') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Riproduci Brano 1', exact: true }).click();
  expect((await request).postData()).toContain('00000000000');
  // Prossimi (the radio's suggestions) is the Ascolta view, never above the results.
  await expect(page.getByRole('region', { name: 'Prossimi' })).toHaveCount(0);
  const box = page.getByRole('searchbox', { name: 'Cerca musica' });
  const top = (await box.boundingBox())?.y;
  const list = page.getByRole('button', { name: 'Riproduci Brano 1', exact: true }).locator('xpath=ancestor::ul[1]');
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.getByRole('button', { name: 'Riproduci Brano 30' }).scrollIntoViewIfNeeded();
  expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect((await box.boundingBox())?.y).toBe(top);
  await page.getByRole('button', { name: 'Ascolta', exact: true }).click();
  await expect(box).toHaveValue('');
  const upcoming = page.getByRole('region', { name: 'Prossimi' });
  await expect(upcoming.getByText('Brano 2', { exact: true })).toBeVisible();
  // Each queue row shows its duration, as the search results do.
  await expect(upcoming.getByRole('listitem').first()).toContainText('2:03');
  await upcoming.getByRole('button', { name: 'Salta' }).click();
  await expect(upcoming.getByText('Brano 2', { exact: true })).toHaveCount(0);
  await expect(upcoming.getByText('Brano 3', { exact: true })).toBeVisible();
});

for (const size of [
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
]) {
  test(`the page fits ${size.width}x${size.height}: no page scroll, player and Ctrl K in view, lists scroll inside`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto('/desk/media');
    await search(page);
    await expect(page.getByRole('button', { name: 'Riproduci Brano 30' })).toHaveCount(1);
    const player = page.getByRole('region', { name: 'Player musicale' });
    await expect(player).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('navigation', { name: 'Zone' }).getByText('Ctrl K', { exact: true })).toBeInViewport();
    const fit = await page.evaluate(() => {
      const surface = document.querySelector('[data-page-surface]');
      const bar = document.querySelector('section[aria-label="Player musicale"]');
      const results = document.querySelector('section[aria-label="Risultati"] ul');
      return {
        page: document.documentElement.scrollHeight <= window.innerHeight,
        surface: !!surface && surface.scrollHeight <= surface.clientHeight,
        barInside: !!surface && !!bar && bar.getBoundingClientRect().bottom <= surface.getBoundingClientRect().bottom,
        listScrolls: !!results && results.scrollHeight > results.clientHeight,
      };
    });
    expect(fit).toEqual({ page: true, surface: true, barInside: true, listScrolls: true });
  });
}

test('the audio popup holds the output switch and the music volume, the page header no output button', async ({
  page,
}) => {
  await page.goto('/desk/media');
  await expect(page.getByRole('button', { name: 'Cambia uscita audio' })).toHaveCount(0);
  const open = page.getByRole('button', { name: 'Audio: Cuffie, volume musica 100%' });
  await expect(open).toContainText('Cuffie');
  await open.click();
  const popup = page.getByRole('dialog', { name: 'Audio' });
  const outputs = popup.getByRole('toolbar', { name: 'Uscite configurate' });
  await expect(outputs.getByRole('button', { name: 'Cuffie' })).toHaveAttribute('aria-pressed', 'true');
  await outputs.getByRole('button', { name: 'Casse' }).click();
  await expect(outputs.getByRole('button', { name: 'Casse' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Audio: Casse, volume musica 100%' })).toBeVisible();
  await expect(popup.getByText('Solo la musica di Hub, non il volume del sistema')).toBeVisible();
});

test('the music volume slider changes the music volume only, not the system volume', async ({ page, pc }) => {
  const volumes = async () => ({
    music: (await (await pc.get('/trpc/music.state')).json()).result.data.volume,
    system: (await (await pc.get('/trpc/audio.state')).json()).result.data.volume,
  });
  const before = await volumes();
  expect(before.music).toBe(100);
  await page.goto('/desk/media');
  await page.getByRole('button', { name: /^Audio: Cuffie, volume musica/ }).click();
  const slider = page.getByRole('dialog', { name: 'Audio' }).getByRole('slider', { name: 'Volume musica' });
  await expect(slider).toHaveValue('100');
  await slider.focus();
  const request = page.waitForRequest((r) => r.url().includes('music.setVolume') && r.method() === 'POST');
  await slider.press('Home');
  expect((await request).postData()).toContain('"volume":0');
  await expect(page.getByRole('button', { name: 'Audio: Cuffie, volume musica 0%' })).toBeVisible();
  expect(await volumes()).toEqual({ music: 0, system: before.system });
  await page.goto('/desk/system');
  await expect(page.getByRole('slider', { name: 'Volume', exact: true })).toHaveValue(
    String(Math.round(before.system * 100)),
  );
});

test('favorites are available as a view and can seed the radio', async ({ page }) => {
  await page.goto('/desk/media');
  await search(page);
  const heart = page.getByRole('button', { name: 'Preferito Brano 1', exact: true });
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Preferiti', exact: true }).click();
  const done = played(page);
  await page.getByRole('button', { name: 'Riproduci Brano 1', exact: true }).click();
  await done;
  await page.getByRole('button', { name: 'Ascolta', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Prossimi' })).toContainText('Brano 3');
  await page.getByRole('button', { name: 'Cronologia', exact: true }).click();
  await expect(page.getByText('Nessun brano ascoltato')).toBeVisible();
});

test('Ascolta shows the recent songs once each and a tile plays', async ({ page }) => {
  const row = { id: 'recent00001', title: 'Vecchio brano', artist: 'Artista', playedAt: 1 };
  await answerQueries(page, { 'music.history': [row, { ...row, playedAt: 2 }] });
  await page.goto('/desk/media');
  const recent = page.getByRole('region', { name: 'Ascoltati di recente' });
  await expect(recent.getByRole('listitem')).toHaveCount(1);
  const request = page.waitForRequest((r) => r.url().includes('music.play') && r.method() === 'POST');
  await recent.getByRole('button', { name: 'Riproduci Vecchio brano' }).click();
  expect((await request).postData()).toContain('recent00001');
});

test('playlist can be created, populated, reordered, played and deleted with a hold', async ({ page }) => {
  await page.goto('/desk/media');
  await page.getByRole('button', { name: 'Crea playlist' }).click();
  await page
    .getByRole('dialog', { name: 'Nuova playlist' })
    .getByRole('textbox', { name: 'Nome playlist' })
    .fill('Mix test');
  await page.getByRole('dialog', { name: 'Nuova playlist' }).getByRole('button', { name: 'Crea', exact: true }).click();
  await expect(library(page).getByRole('button', { name: 'Mix test', exact: true })).toBeVisible();
  await search(page, 'playlist-test');
  for (const title of ['Mix 1', 'Mix 2']) {
    await page.getByRole('button', { name: `Aggiungi ${title} a playlist` }).click();
    await page.getByRole('dialog', { name: 'Aggiungi a playlist' }).getByRole('button', { name: 'Mix test' }).click();
    await expect(page.getByRole('dialog', { name: 'Aggiungi a playlist' })).toHaveCount(0);
  }
  await library(page).getByRole('button', { name: 'Mix test', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Cerca musica' })).toHaveValue('');
  await page.getByRole('button', { name: 'Sposta su Mix 2' }).click();
  await expect(page.getByRole('region', { name: 'Mix test' }).getByRole('listitem').first()).toContainText('Mix 2');
  await page.getByRole('button', { name: 'Riproduci playlist' }).click();
  await page.getByRole('button', { name: 'Ascolta', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Prossimi' }).getByRole('listitem').first()).toContainText('Mix 1');
  await library(page).getByRole('button', { name: 'Mix test', exact: true }).click();
  await holdDelete(page);
  await expect(library(page).getByRole('button', { name: 'Mix test', exact: true })).toHaveCount(0);
});

test('a playlist is created from the add popover with the song in it, renamed and deleted', async ({ page }) => {
  await page.goto('/desk/media');
  await search(page, 'playlist-test');
  await page.getByRole('button', { name: 'Aggiungi Mix 1 a playlist' }).click();
  const popover = page.getByRole('dialog', { name: 'Aggiungi a playlist' });
  await popover.getByRole('textbox', { name: 'Nome playlist' }).fill('Dal popover');
  await popover.getByRole('button', { name: 'Crea', exact: true }).click();
  await expect(popover).toHaveCount(0);
  await library(page).getByRole('button', { name: 'Dal popover', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Dal popover' })).toContainText('Mix 1');
  await page.getByRole('button', { name: 'Rinomina', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome playlist' }).fill('Rinominata');
  await page.getByRole('button', { name: 'Rinomina', exact: true }).click();
  await expect(library(page).getByRole('button', { name: 'Rinominata', exact: true })).toBeVisible();
  await expect(library(page).getByRole('button', { name: 'Dal popover', exact: true })).toHaveCount(0);
  await holdDelete(page);
  await expect(library(page).getByRole('button', { name: 'Rinominata', exact: true })).toHaveCount(0);
});

test('public playlist can be found, played and saved locally', async ({ page }) => {
  await page.goto('/desk/media');
  await search(page, 'mix');
  await page.getByRole('button', { name: 'Playlist pubbliche' }).click();
  await page.getByRole('button', { name: 'Playlist pubblica', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Playlist pubblica' })).toContainText('Brano 1');
  const play = page.waitForResponse((response) => response.url().includes('music.playPublicPlaylist'));
  await page.getByRole('button', { name: 'Riproduci playlist' }).click();
  expect((await play).ok()).toBeTruthy();
  const save = page.waitForResponse((response) => response.url().includes('music.savePublicPlaylist'));
  await page.getByRole('button', { name: 'Salva', exact: true }).click();
  expect((await save).ok()).toBeTruthy();
  await library(page).getByRole('button', { name: 'Playlist pubblica', exact: true }).click();
  await holdDelete(page);
  await expect(library(page).getByRole('button', { name: 'Playlist pubblica', exact: true })).toHaveCount(0);
});
