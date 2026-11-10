import { expect, test } from './fixtures.ts';
import { SERVER_URL } from './hosts.ts';

test('Messaggi shows the Posta inbox', async ({ page }) => {
  await page.goto('/desk');
  await page.getByRole('link', { name: 'Messaggi', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Messaggi' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Posta' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Offerta di colloquio/ })).toBeVisible();
});

test('read and star actions change the message state', async ({ page, pc }) => {
  try {
    await page.goto('/desk/messaggi');
    await page.getByRole('button', { name: /Offerta di colloquio/ }).click();
    await page.getByRole('button', { name: 'Segna come letto' }).click();
    await expect(page.getByRole('button', { name: 'Segna come non letto' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Segna come non letto' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Offerta di colloquio.*Non letto/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Contrassegna', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Contrassegna', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      page.getByRole('button', { name: /Offerta di colloquio.*Contrassegnato/ }).locator('svg'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Segna come non letto' }).click();
    await expect(page.getByRole('button', { name: 'Segna come letto' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Segna come letto' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: /Offerta di colloquio.*Non letto/ })).toBeVisible();
    await page.getByRole('button', { name: 'Contrassegna', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Contrassegna', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByRole('button', { name: /Offerta di colloquio.*Contrassegnato/ })).toHaveCount(0);
  } finally {
    await pc.post('/trpc/mail.setSeen', { data: { account: 'work', ids: ['310'], seen: false } });
    await pc.post('/trpc/mail.setFlagged', { data: { account: 'work', ids: ['310'], flagged: false } });
  }
});

test('accounts, search and reading preserve unread state', async ({ page, request }) => {
  await page.goto('/desk/messaggi');
  await page.getByRole('button', { name: 'Account: Lavoro' }).click();
  await page.getByRole('option', { name: 'Personale' }).click();
  await expect(page.getByRole('button', { name: /Iscrizione al club/ })).toBeVisible();
  await page.getByRole('button', { name: 'Account: Personale' }).click();
  await page.getByRole('option', { name: 'Lavoro' }).click();
  await page.getByRole('textbox', { name: 'Mittente' }).fill('Recruiter');
  await page.getByRole('button', { name: 'Cerca', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Posta in arrivo' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Offerta di colloquio/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Newsletter di prova/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Offerta di colloquio/ }).click();
  await expect(page.getByText('vorremmo proporle un colloquio.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Segna come letto' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Offerta di colloquio.*Non letto/ })).toBeVisible();
  const trace = JSON.stringify(await (await request.get(`${SERVER_URL}/__fake/mail`)).json());
  expect(trace).toContain('"message","read"');
  expect(trace).not.toContain('--seen');
});

test('the mail UI is absent when its procedures are not configured', async ({ page }) => {
  await page.route('**/trpc/mail.accounts*', (route) => route.fulfill({ status: 404, body: '{}' }));
  const unavailable = page.waitForResponse((response) => response.url().includes('/trpc/mail.accounts'));
  await page.goto('/desk');
  await unavailable;
  await expect(page.getByRole('link', { name: 'Messaggi', exact: true })).toHaveCount(0);
});

test('a failed inbox can be retried', async ({ page, request }) => {
  try {
    expect((await request.post(`${SERVER_URL}/__fake/mail`, { data: { fail: true } })).ok()).toBe(true);
    await page.goto('/desk/messaggi');
    await expect(page.getByText('Impossibile caricare la posta')).toBeVisible();
    await request.post(`${SERVER_URL}/__fake/mail`, { data: { fail: false } });
    await page.getByRole('button', { name: 'Riprova' }).click();
    await expect(page.getByRole('button', { name: /Offerta di colloquio/ })).toBeVisible();
  } finally {
    await request.post(`${SERVER_URL}/__fake/mail`, { data: { fail: false } });
  }
});
