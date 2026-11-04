import type { APIRequestContext } from '@playwright/test';

const post = (request: APIRequestContext, path: string, data: unknown = {}) =>
  request.post(`/trpc/${path}`, { data, headers: { 'content-type': 'application/json' } });

/** Same action over plain HTTP, like a media key or another device would trigger it. */
export const playPause = (pc: APIRequestContext) => post(pc, 'media.playPause');

/**
 * Puts the shared fake desktop back to where it starts (playing, first output). A test that fails halfway leaves it
 * flipped, and without this every test after it would fail too, hiding which one is the cause.
 */
export async function restoreDesktop(pc: APIRequestContext) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await (await pc.get('/trpc/media.state')).text()).includes('"title":"Title"')) break;
    await post(pc, 'media.next');
  }
  if ((await (await pc.get('/trpc/media.state')).text()).includes('"Paused"')) await playPause(pc);
  if ((await (await pc.get('/trpc/audio.state')).text()).includes('"current":{"label":"Casse"}'))
    await post(pc, 'audio.cycleOutput');
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
