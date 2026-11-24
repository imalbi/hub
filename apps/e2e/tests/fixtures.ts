import { test as base, type APIRequestContext } from '@playwright/test';
import { PC_URL, PHONE_URL } from './hosts.ts';

export { expect } from '@playwright/test';
export type { Page, APIRequestContext } from '@playwright/test';

/**
 * Two API clients on the same fake server: `pc` calls it as the PC does (the desk, a media key), `phone` as a device
 * on the LAN would, with no trust of its own (see `fake.ts` for how the host tells them apart).
 */
export const test = base.extend<{ pc: APIRequestContext; phone: APIRequestContext }>({
  pc: async ({ playwright }, provide) => {
    const pc = await playwright.request.newContext({ baseURL: PC_URL });
    await provide(pc);
    await pc.dispose();
  },
  phone: async ({ playwright }, provide) => {
    const phone = await playwright.request.newContext({ baseURL: PHONE_URL });
    await provide(phone);
    await phone.dispose();
  },
});
