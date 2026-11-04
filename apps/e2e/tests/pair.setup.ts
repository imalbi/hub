import { expect, test as setup } from '@playwright/test';
import { DECK_STATE, PC_URL, PHONE_URL } from './hosts.ts';

// The real flow, every run: the desk shows a code, a fresh browser enters it on the pairing screen and reaches the tiles.
setup('pair the deck through the desk and the pairing screen', async ({ browser }) => {
  const desk = await browser.newPage({ baseURL: PC_URL });
  await desk.goto('/desk/devices');
  await desk.getByRole('button', { name: 'Genera codice' }).click();
  const code = await desk.getByRole('status', { name: 'Codice di abbinamento' }).innerText();
  expect(code).toMatch(/^\d{6}$/);

  const phone = await browser.newContext({ baseURL: PHONE_URL });
  const deck = await phone.newPage();
  await deck.goto('/deck');
  await deck.getByLabel('Codice').fill(code);
  await deck.getByRole('button', { name: 'Abbina' }).click();
  await expect(deck.getByRole('button', { name: /^Uscita audio: Cuffie/ })).toBeVisible();

  await phone.storageState({ path: DECK_STATE });
  await phone.close();
  await desk.close();
});
