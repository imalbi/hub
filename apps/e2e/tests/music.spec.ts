import { expect, test } from './fixtures.ts';
import { restoreDesktop } from './desktop.ts';

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

test('artist opens from a row, plays a top song and returns to its source', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk/media');
  await page.getByRole('searchbox', { name: 'Cerca musica' }).fill('canzone');
  await page.getByRole('button', { name: 'Artista', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Artista', exact: true })).toBeVisible();
  await expect(page.getByText('Disco esempio', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Artista' }).locator('img')).toHaveCount(2);
  const played = page.waitForResponse(
    (response) => response.url().includes('music.play') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Riproduci Brano artista' }).click();
  await played;
  await page.getByRole('button', { name: 'Torna indietro' }).click();
  await expect(page.getByRole('button', { name: 'Riproduci Brano 1', exact: true })).toBeVisible();
});

test('artist opened from radio returns to radio', async ({ page }) => {
  await page.goto('/desk/media');
  await page.getByRole('searchbox', { name: 'Cerca musica' }).fill('canzone');
  await page.getByRole('button', { name: 'Riproduci Brano 1', exact: true }).click();
  await page.getByRole('button', { name: 'Radio', exact: true }).click();
  await page
    .getByRole('region', { name: 'Prossimi' })
    .getByRole('button', { name: 'Artista', exact: true })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Artista', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Torna indietro' }).click();
  await expect(page.getByRole('region', { name: 'Prossimi' })).toBeVisible();
});

test('search, play and fixed search while results scroll', async ({ page }) => {
  // 4K, the desk's real size: below it the Media page leaves the music list about 48 px (2026-11-11, see 23f), so a
  // smaller viewport measured a crushed layout, not the fixed search.
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/desk/media');
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Player musicale' })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Cerca musica' });
  await search.fill('canzone');
  await expect(page.getByRole('button', { name: 'Riproduci Brano 1', exact: true })).toBeVisible();
  const request = page.waitForRequest((r) => r.url().includes('music.play') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Riproduci Brano 1', exact: true }).click();
  expect((await request).postData()).toContain('00000000000');
  // Prossimi (the radio's suggestions) lives in its own Radio view, never above the results.
  await expect(page.getByRole('region', { name: 'Prossimi' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Radio' }).click();
  const upcoming = page.getByRole('region', { name: 'Prossimi' });
  await expect(upcoming.getByText('Brano 2', { exact: true })).toBeVisible();
  // Prossimi shows each song's duration, as the search results do.
  await expect(upcoming.getByRole('listitem').first()).toContainText('2:03');
  await upcoming.getByRole('button', { name: 'Salta' }).click();
  await expect(upcoming.getByText('Brano 2', { exact: true })).toHaveCount(0);
  await expect(upcoming.getByText('Brano 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Risultati' }).click();
  const top = (await search.boundingBox())?.y;
  const list = page.getByRole('button', { name: 'Riproduci Brano 1', exact: true }).locator('xpath=ancestor::ul/..');
  // The list must really scroll here, or the check below proves nothing.
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.getByRole('button', { name: 'Riproduci Brano 30' }).scrollIntoViewIfNeeded();
  expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect((await search.boundingBox())?.y).toBe(top);
});

test('audio controls are on Sistema and the output shortcut remains on Media', async ({ page }) => {
  await page.goto('/desk/media');
  await expect(page.getByRole('button', { name: 'Cambia uscita audio' })).toBeVisible();
  const shortcut = page.getByRole('button', { name: 'Cambia uscita audio' });
  const changed = page.waitForResponse((response) => response.url().includes('audio.cycleOutput'));
  await shortcut.click();
  await changed;
  await shortcut.click();
  await expect(page.getByRole('slider', { name: 'Volume' })).toHaveCount(0);
  await page.goto('/desk/system');
  await expect(page.getByRole('slider', { name: 'Volume' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Silenzia uscita audio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Silenzia microfono' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Uscite configurate' })).toBeVisible();
});

test('favorites are available as a view and can seed the radio', async ({ page }) => {
  await page.goto('/desk/media');
  await page.getByRole('searchbox', { name: 'Cerca musica' }).fill('canzone');
  const heart = page.getByRole('button', { name: 'Preferito Brano 1', exact: true });
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Preferiti', exact: true }).click();
  const played = page.waitForResponse(
    (response) => response.url().includes('music.play') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Riproduci Brano 1', exact: true }).click();
  await played;
  await page.getByRole('button', { name: 'Radio' }).click();
  await expect(page.getByRole('region', { name: 'Prossimi' })).toContainText('Brano 3');
  await page.getByRole('button', { name: 'Cronologia', exact: true }).click();
  await expect(page.getByText('Nessun brano ascoltato')).toBeVisible();
});

test('playlist can be created, populated, reordered, played and deleted with a hold', async ({ page }) => {
  await page.goto('/desk/media');
  await page.getByRole('button', { name: 'Playlist', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome playlist' }).fill('Mix test');
  await page.getByRole('button', { name: 'Crea playlist' }).click();
  await page.getByRole('button', { name: 'Risultati', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Cerca musica' }).fill('playlist-test');
  for (const title of ['Mix 1', 'Mix 2']) {
    await page.getByRole('button', { name: `Aggiungi ${title} a playlist` }).click();
    await page.getByRole('dialog', { name: 'Aggiungi a playlist' }).getByRole('button', { name: 'Mix test' }).click();
    await expect(page.getByRole('dialog', { name: 'Aggiungi a playlist' })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Playlist', exact: true }).click();
  await page.getByRole('button', { name: 'Mix test', exact: true }).click();
  await page.getByRole('button', { name: 'Sposta su Mix 2' }).click();
  await page.getByRole('button', { name: 'Riproduci playlist' }).click();
  await page.getByRole('button', { name: 'Radio', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Prossimi' }).getByRole('listitem').first()).toContainText('Mix 1');
  await page.getByRole('button', { name: 'Playlist', exact: true }).click();
  await page.getByRole('button', { name: 'Mix test', exact: true }).click();
  const remove = page.getByRole('button', { name: 'Tieni premuto per eliminare playlist' });
  await remove.focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(900);
  await page.keyboard.up('Space');
  await expect(page.getByRole('button', { name: 'Mix test', exact: true })).toHaveCount(0);
});

test('public playlist can be found, played and saved locally', async ({ page }) => {
  await page.goto('/desk/media');
  await page.getByRole('searchbox', { name: 'Cerca musica' }).fill('mix');
  await page.getByRole('button', { name: 'Playlist pubbliche' }).click();
  await page.getByRole('button', { name: 'Playlist pubblica', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Playlist pubblica' })).toContainText('Brano 1');
  const play = page.waitForResponse((response) => response.url().includes('music.playPublicPlaylist'));
  await page.getByRole('button', { name: 'Riproduci playlist' }).click();
  expect((await play).ok()).toBeTruthy();
  const save = page.waitForResponse((response) => response.url().includes('music.savePublicPlaylist'));
  await page.getByRole('button', { name: 'Salva', exact: true }).click();
  expect((await save).ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Playlist', exact: true }).click();
  await page.getByRole('button', { name: 'Playlist pubblica', exact: true }).click();
  await page.getByRole('button', { name: 'Tieni premuto per eliminare playlist' }).focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(900);
  await page.keyboard.up('Space');
  await expect(page.getByRole('button', { name: 'Playlist pubblica', exact: true })).toHaveCount(0);
});
