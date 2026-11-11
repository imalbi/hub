import { expect, test } from './fixtures.ts';

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
