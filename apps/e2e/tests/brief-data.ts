import type { APIRequestContext, Page } from '@playwright/test';

export const briefBullets = [
  'Alle 09:00 hai una riunione.',
  'Un post-it ricorda di preparare i documenti.',
  'Il pomeriggio non ha altri impegni.',
];
export const briefTime = new Date('2026-11-27T08:00:00+01:00').getTime();

export async function placeBrief(pc: APIRequestContext, size: 'medium' | 'large' | 'wide' = 'large') {
  await pc.post('/trpc/layout.save', {
    data: { zone: 'overview', items: [{ widget: 'brief', size, x: 0, y: 0 }] },
  });
}

export async function mockBrief(page: Page, beforeRefresh?: () => Promise<void>) {
  let refreshes = 0;
  await page.route('**/trpc/*', async (route) => {
    const paths = new URL(route.request().url()).pathname.replace('/trpc/', '').split(',');
    if (!paths.some((path) => path.startsWith('brief.'))) return route.continue();
    if (paths.includes('brief.refresh')) {
      refreshes++;
      await beforeRefresh?.();
    }
    const response = await route.fetch();
    const body: unknown = await response.json();
    if (Array.isArray(body)) {
      for (const [index, entry] of body.entries()) {
        if (paths[index]?.startsWith('brief.') && entry?.result) {
          entry.result.data = {
            day: '2026-11-27',
            status: 'ready',
            generatedAt: briefTime + refreshes * 60_000,
            lastCursorAt: briefTime,
            bullets: refreshes ? ['Il brief è stato aggiornato.'] : briefBullets,
            counts: { calendar: 1, notes: 1 },
          };
        }
      }
    }
    return route.fulfill({ response, json: body });
  });
}
