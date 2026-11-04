import type { APIRequestContext } from '@playwright/test';

const post = (request: APIRequestContext, path: string) =>
  request.post(`/trpc/${path}`, { data: {}, headers: { 'content-type': 'application/json' } });

/** Same action over plain HTTP, like a media key or another device would trigger it. */
export const playPause = (request: APIRequestContext) => post(request, 'media.playPause');

/**
 * Puts the shared fake desktop back to where it starts (playing, first output). A test that fails halfway leaves it
 * flipped, and without this every test after it would fail too, hiding which one is the cause.
 */
export async function restoreDesktop(request: APIRequestContext) {
  if ((await (await request.get('/trpc/media.state')).text()).includes('"Paused"')) await playPause(request);
  if ((await (await request.get('/trpc/audio.state')).text()).includes('"current":{"label":"Casse"}'))
    await post(request, 'audio.cycleOutput');
}
