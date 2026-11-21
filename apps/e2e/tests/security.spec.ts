import { expect, test } from './fixtures.ts';
import { revokeDevices } from './desktop.ts';
import { SERVER_PORT, SERVER_URL } from './hosts.ts';

test('desk and deck load from the server under helmet CSP with zero browser violations', async ({
  browser,
  page,
  pc,
}) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    window.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.violatedDirective}:${event.blockedURI}`);
      document.documentElement.setAttribute('data-csp-violations', JSON.stringify(violations));
    });
  });

  const deskErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /content security policy|csp/i.test(msg.text())) deskErrors.push(msg.text());
  });
  page.on('pageerror', (err) => deskErrors.push(err.message));

  const deskResponse = await page.goto(`http://localhost:${SERVER_PORT}/desk`);
  if (!deskResponse) throw new Error('Expected navigation response for /desk');
  const deskHeaders = deskResponse.headers();
  expect(deskHeaders['x-frame-options']).toBe('DENY');
  expect(deskHeaders['referrer-policy']).toBe('no-referrer');
  expect(deskHeaders['x-content-type-options']).toBe('nosniff');
  expect(deskHeaders['cross-origin-resource-policy']).toBe('same-origin');
  expect(deskHeaders['strict-transport-security']).toBeUndefined();
  const deskCsp = deskHeaders['content-security-policy'] ?? '';
  expect(deskCsp).toContain("script-src 'self'");
  expect(deskCsp).toContain("frame-ancestors 'none'");
  expect(deskCsp).not.toContain('upgrade-insecure-requests');
  expect(deskCsp).not.toContain('unsafe-eval');

  await expect(page.getByRole('button', { name: 'Cerca o esegui, scorciatoia Ctrl K' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Zone' }).getByRole('link', { name: 'Impostazioni', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Impostazioni', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-csp-violations'))).toBeNull();
  expect(deskErrors).toEqual([]);

  const codeResponse = await pc.post(`http://localhost:${SERVER_PORT}/trpc/pairing.createCode`, {
    data: {},
    headers: { 'content-type': 'application/json' },
  });
  expect(codeResponse.ok()).toBe(true);
  const { code } = (await codeResponse.json()).result.data;

  const phoneContext = await browser.newContext({
    baseURL: SERVER_URL,
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 3,
  });
  try {
    const deck = await phoneContext.newPage();
    await deck.addInitScript(() => {
      const violations: string[] = [];
      window.addEventListener('securitypolicyviolation', (event) => {
        violations.push(`${event.violatedDirective}:${event.blockedURI}`);
        document.documentElement.setAttribute('data-csp-violations', JSON.stringify(violations));
      });
    });
    const deckErrors: string[] = [];
    deck.on('console', (msg) => {
      if (msg.type() === 'error' && /content security policy|csp/i.test(msg.text())) deckErrors.push(msg.text());
    });
    deck.on('pageerror', (err) => deckErrors.push(err.message));

    const deckResponse = await deck.goto(`${SERVER_URL}/deck`);
    if (!deckResponse) throw new Error('Expected navigation response for /deck');
    const deckHeaders = deckResponse.headers();
    expect(deckHeaders['x-frame-options']).toBe('DENY');
    expect(deckHeaders['strict-transport-security']).toBeUndefined();
    expect(deckHeaders['content-security-policy'] ?? '').not.toContain('upgrade-insecure-requests');

    await deck.getByLabel('Codice').fill(code);
    await deck.getByLabel('Nome del dispositivo').fill('Security test phone');
    await deck.getByRole('button', { name: 'Abbina' }).click();
    await expect(deck.getByRole('button', { name: /^Uscita audio: Cuffie/ })).toBeVisible();
    expect(await deck.evaluate(() => document.documentElement.getAttribute('data-csp-violations'))).toBeNull();
    expect(deckErrors).toEqual([]);
  } finally {
    await phoneContext.close();
    await revokeDevices(pc, 'Security test phone');
  }
});
