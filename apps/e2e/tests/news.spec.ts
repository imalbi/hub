import { expect, test } from './fixtures.ts';

// The fake config names the digest `webdigest` and the fake desktop only records it: a real run marks news seen.
test('the Notizie widget shows the digest count and refreshes and opens it on the PC', async ({ page, pc }) => {
  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: [{ widget: 'news', size: 'medium', x: 0, y: 0 }] },
    headers: { 'content-type': 'application/json' },
  });
  try {
    await page.goto('/desk');
    const news = page.getByRole('region', { name: 'Notizie' });
    await expect(news.getByText('22', { exact: true })).toBeVisible();
    await expect(news.getByText('Aggiornato 4 nov, 08:30')).toBeVisible();
    for (const name of ['Aggiorna', 'Apri']) {
      const button = news.getByRole('button', { name, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('data-status', 'success');
    }
  } finally {
    await pc.post('/trpc/layout.reset', {
      data: { zone: 'overview' },
      headers: { 'content-type': 'application/json' },
    });
  }
});
