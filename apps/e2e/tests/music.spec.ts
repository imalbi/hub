import { expect, test } from './fixtures.ts';

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
  await page.setViewportSize({ width: 1920, height: 750 });
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
  await page.getByRole('button', { name: 'Riproduci Brano 30' }).scrollIntoViewIfNeeded();
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
