import type { APIRequestContext, Page } from '@playwright/test';
import { SERVER_URL } from './hosts.ts';

const post = (request: APIRequestContext, path: string, data: unknown = {}) =>
  request.post(`/trpc/${path}`, { data, headers: { 'content-type': 'application/json' } });

/** Same action over plain HTTP, like a media key or another device would trigger it. */
export const playPause = (pc: APIRequestContext) => post(pc, 'media.playPause');

/**
 * Puts the shared fake desktop back to where it starts (playing at 0:12, first output). A test that fails halfway leaves it
 * flipped, and without this every test after it would fail too, hiding which one is the cause.
 */
export async function restoreDesktop(pc: APIRequestContext) {
  // `pc` goes through the web server, which does not proxy the fake hooks: they live on the fake server only.
  await pc.post(`${SERVER_URL}/__fake/player`, { data: { gone: false } });
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await (await pc.get('/trpc/media.state')).text()).includes('"title":"Title"')) break;
    await post(pc, 'media.next');
  }
  if ((await (await pc.get('/trpc/media.state')).text()).includes('"Paused"')) await playPause(pc);
  await post(pc, 'media.seek', { seconds: 12 });
  if ((await (await pc.get('/trpc/audio.state')).text()).includes('"current":{"label":"Casse"}'))
    await post(pc, 'audio.cycleOutput');
  // The music volume is mpv's own: a test that moved it leaves the next one a quiet player.
  await post(pc, 'music.setVolume', { volume: 100 });
}

const result = async (response: Awaited<ReturnType<typeof post>>) => (await response.json()).result.data;

/** Pairs a new device through the API and returns its token: a pairing code from the PC, redeemed like the deck does. */
export async function pairDevice(pc: APIRequestContext, deviceName: string): Promise<string> {
  const { code } = await result(await post(pc, 'pairing.createCode'));
  return (await result(await post(pc, 'pairing.redeem', { code, deviceName }))).token;
}

/** Revokes every device with this name; a test that paired one cleans up with it. */
export async function revokeDevices(pc: APIRequestContext, name: string) {
  const devices: Array<{ id: number; name: string }> = await result(await pc.get('/trpc/devices.list'));
  for (const device of devices.filter((d) => d.name === name))
    await post(pc, 'devices.revoke', { id: device.id, confirmed: true });
}

// tRPC batches queries made together into one URL (`/trpc/a,b`): ask the real server, then swap the mocked results.
export async function answerQueries(page: Page, answers: Record<string, unknown>) {
  // Every tRPC URL: a batch can start with any other procedure (`notes.list,devices.list`), and a glob on the
  // first name let the real answer through under load.
  await page.route('**/trpc/*', async (route, request) => {
    const names = decodeURIComponent(new URL(request.url()).pathname.replace('/trpc/', '')).split(',');
    if (!names.some((name) => name in answers)) return route.fallback();
    let real: unknown;
    try {
      real = await (await route.fetch()).json();
    } catch {
      // The test ended with this batch in flight:
      // nothing waits for the answer any more.
      return route.abort().catch(() => undefined);
    }
    const results = Array.isArray(real) ? real : [];
    return route
      .fulfill({
        json: names.map((name, i) => (name in answers ? { result: { data: answers[name] } } : results[i])),
      })
      .catch(() => undefined);
  });
}
