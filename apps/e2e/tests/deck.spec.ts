import type { Page } from '@playwright/test';
import { playPause, restoreDesktop } from './desktop.ts';
import { expect, test } from './fixtures.ts';
import { controlSockets } from './sockets.ts';

const audioTile = (page: Page) => page.getByRole('button', { name: /^Uscita audio/ });
const mediaTile = (page: Page) => page.getByRole('button', { name: /^Musica/ });

test.beforeEach(async ({ page }) => {
  await page.goto('/deck');
});

test.afterEach(async ({ pc }) => {
  await restoreDesktop(pc);
});

test('both tiles show the state of the fake desktop', async ({ page }) => {
  await expect(audioTile(page)).toHaveAccessibleName('Uscita audio: Cuffie');
  await expect(mediaTile(page)).toHaveAccessibleName('Musica: Artist - Title, in riproduzione');
  // The icon is the action a tap performs: Pause while playing.
  await expect(mediaTile(page).locator('svg.lucide-pause')).toBeVisible();
});

test('tapping the audio tile switches to the other output and back', async ({ page }) => {
  await audioTile(page).click();
  await expect(audioTile(page)).toHaveAccessibleName('Uscita audio: Casse');
  await audioTile(page).click();
  await expect(audioTile(page)).toHaveAccessibleName('Uscita audio: Cuffie');
});

test('tapping the media tile flips the icon and the play state', async ({ page }) => {
  await mediaTile(page).click();
  await expect(mediaTile(page)).toHaveAccessibleName('Musica: Artist - Title, in pausa');
  await expect(mediaTile(page).locator('svg.lucide-play')).toBeVisible();
  await mediaTile(page).click();
  await expect(mediaTile(page)).toHaveAccessibleName('Musica: Artist - Title, in riproduzione');
  await expect(mediaTile(page).locator('svg.lucide-pause')).toBeVisible();
});

test('a change made elsewhere reaches the open page without a reload', async ({ page, pc }) => {
  await expect(mediaTile(page)).toHaveAccessibleName(/in riproduzione/);
  // A second client: the same action over plain HTTP, as a media key or another device would trigger it.
  expect((await playPause(pc)).ok()).toBe(true);
  await expect(mediaTile(page)).toHaveAccessibleName(/in pausa/);
  expect((await playPause(pc)).ok()).toBe(true);
  await expect(mediaTile(page)).toHaveAccessibleName(/in riproduzione/);
});

test('the connection-lost state shows when the socket drops and clears when it is back', async ({ page }) => {
  const sockets = await controlSockets(page);
  await page.goto('/deck');
  await expect(audioTile(page)).toHaveAccessibleName('Uscita audio: Cuffie');
  await expect(page.getByText('Connessione persa')).toBeHidden();

  await sockets.cut();
  // The retry backs off, so the page may need a few seconds: the default 5 s expect timeout is too tight.
  await expect(page.getByText('Connessione persa')).toBeVisible({ timeout: 15_000 });
  // The last known state stays on the tile.
  await expect(audioTile(page)).toHaveAccessibleName(/Cuffie/);

  await sockets.restore();
  await expect(page.getByText('Connessione persa')).toBeHidden({ timeout: 15_000 });
});
