import { expect, test } from './fixtures.ts';
import { briefBullets, briefTime, mockBrief, placeBrief } from './brief-data.ts';
import { controlSockets } from './sockets.ts';

// Restore the default board before another spec uses this fake server.
test.afterEach(async ({ page, pc }) => {
  await page.close();
  await pc.post('/trpc/layout.reset', { data: { zone: 'overview' } });
});

test('J5: brief refresh updates summary and generation time in every offered size', async ({ page, pc }) => {
  await mockBrief(page);
  await page.setViewportSize({ width: 3840, height: 2160 });
  for (const size of ['medium', 'large', 'wide'] as const) {
    await placeBrief(pc, size);
    await page.goto('/desk');
    const panel = page.getByRole('region', { name: 'Brief del mattino' });
    await expect(panel.getByRole('listitem').first()).toBeVisible();
    expect(await panel.evaluate((el) => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
  }
  const panel = page.getByRole('region', { name: 'Brief del mattino' });
  await expect(panel.getByRole('listitem')).toHaveText(briefBullets);
  await expect(panel.locator('time')).toHaveAttribute('datetime', new Date(briefTime).toISOString());
  await panel.getByRole('button', { name: 'Aggiorna', exact: true }).click();
  await expect(panel.getByRole('listitem')).toHaveText(['Il brief è stato aggiornato.']);
  await expect(panel.locator('time')).toHaveAttribute('datetime', new Date(briefTime + 60_000).toISOString());
});

test('J5: disabled provider shows deterministic counts and allows manual retry', async ({ page, pc }) => {
  await placeBrief(pc);
  await page.goto('/desk');
  const panel = page.getByRole('region', { name: 'Brief del mattino' });
  await expect(panel.getByText('Il riepilogo non è disponibile. Puoi riprovare con Aggiorna.')).toBeVisible();
  await expect(panel.getByText(/Elementi di oggi: \d+ in calendario, \d+ post-it\./)).toBeVisible();
  await expect(panel.locator('time')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Aggiorna', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Aggiorna', exact: true })).toBeEnabled();
});

test('J5: manual refresh recovers from an initial preparation transport error', async ({ page, pc }) => {
  await mockBrief(page);
  await page.route('**/trpc/*', async (route) => {
    const paths = new URL(route.request().url()).pathname.replace('/trpc/', '').split(',');
    if (paths.includes('brief.ensureToday')) return route.abort('failed');
    return route.fallback();
  });
  await placeBrief(pc);
  await page.goto('/desk');
  const panel = page.getByRole('region', { name: 'Brief del mattino' });
  await expect(panel.getByText('Il riepilogo non è disponibile. Puoi riprovare con Aggiorna.')).toBeVisible();
  await panel.getByRole('button', { name: 'Aggiorna', exact: true }).click();
  await expect(panel.getByRole('listitem')).toHaveText(['Il brief è stato aggiornato.']);
  await expect(panel.locator('time')).toHaveAttribute('datetime', new Date(briefTime + 60_000).toISOString());
});

test('J5: pending generation shows skeleton and blocks refresh; connection loss blocks it too', async ({
  page,
  pc,
}) => {
  const sockets = await controlSockets(page);
  let finish = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await mockBrief(page, () => pending);
  await placeBrief(pc);
  await page.goto('/desk');
  const panel = page.getByRole('region', { name: 'Brief del mattino' });
  const refresh = panel.getByRole('button', { name: 'Aggiorna', exact: true });
  await expect(refresh).toBeEnabled();
  await refresh.click();
  try {
    await expect(panel.getByLabel('Preparazione del brief')).toBeVisible();
    await expect(refresh).toBeDisabled();
  } finally {
    finish();
  }
  await expect(refresh).toBeEnabled();
  await sockets.cut();
  await expect(refresh).toBeDisabled({ timeout: 15_000 });
});
