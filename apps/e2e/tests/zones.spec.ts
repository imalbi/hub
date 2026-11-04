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

test('number keys switch zones but do not interfere with typing or modified shortcuts', async ({ page }) => {
  await page.goto('/desk/studio');
  await expect(page.getByRole('heading', { level: 1, name: 'Studio' })).toBeVisible();
  for (let i = 0; i < zones.length; i++) {
    await page.keyboard.press(String(i + 1));
    await expect(page).toHaveURL(new RegExp(`${zones[i]?.[1]}/?$`));
  }
  await page.keyboard.press('Control+1');
  await expect(page).toHaveURL(/\/desk\/devices$/);
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Campo di prova');
    document.querySelector('main')?.append(input);
  });
  await page.getByRole('textbox', { name: 'Campo di prova' }).focus();
  await page.keyboard.press('1');
  await expect(page.getByRole('textbox', { name: 'Campo di prova' })).toHaveValue('1');
  await expect(page).toHaveURL(/\/desk\/devices$/);
  await page.getByRole('button', { name: 'Genera codice' }).focus();
  await page.keyboard.press('1');
  await expect(page).toHaveURL(/\/desk\/?$/);
});

test('Media controls existing playback and cycles outputs without making the list interactive', async ({
  page,
  pc,
}) => {
  try {
    await restoreDesktop(pc);
    await page.goto('/desk/media');
    await page.getByRole('button', { name: 'Metti in pausa la musica', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Riproduci musica', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cambia uscita', exact: true }).click();
    const outputs = page.getByRole('list', { name: 'Uscite configurate' });
    await expect(outputs.getByRole('listitem').filter({ hasText: 'Casse' })).toContainText('Attiva');
    await expect(outputs.getByRole('button')).toHaveCount(0);
  } finally {
    await restoreDesktop(pc);
  }
});

test('a chosen theme survives reload and the deck follows it', async ({ page }) => {
  await page.goto('/desk/devices');
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
  await page.goto('/desk/devices');
  await chooseTheme(page, 'Chiaro');
  await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Studio', exact: true }).click();
  for (const name of ['Salta', 'Ferma']) {
    const button = page.getByRole('button', { name, exact: true });
    await button.hover();
    const ratio = await contrastRatio(button);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});
