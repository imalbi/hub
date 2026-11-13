/* oxlint-disable no-underscore-dangle -- tRPC exposes procedure type and meta only through _def */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AnyProcedure } from '@trpc/server';
import { z } from 'zod';
import { emptyConfig } from './core/config.ts';
import { createAppRouter } from './router.ts';
import { publicModules } from './modules.ts';
import { openDb } from './db/index.ts';
import fastify from 'fastify';
import { after } from 'node:test';
import { buildServer } from './server.ts';
import { createFakeDesktop } from './testing/fake-desktop.ts';

// tRPC types `_def.procedures` as the nested router tree but fills it with a flat path-to-procedure map.
function isProcedure(value: unknown): value is AnyProcedure {
  return typeof value === 'function';
}

process.env.NODE_ENV = 'test';

const db = openDb(':memory:');
const closes: Array<() => void | Promise<void>> = [];
const appRouter = createAppRouter(
  publicModules,
  { db, run: createFakeDesktop(), fetch, log: fastify().log, zones: new Set() },
  emptyConfig,
  (close) => closes.push(close),
);
after(async () => {
  for (const close of closes) await close();
  db.$client.close();
});

const metaSchema = z.object({ label: z.string().trim().min(1), description: z.string().min(1) });

void test('metadata validation refuses missing or blank action labels', () => {
  assert.equal(metaSchema.safeParse({ description: 'Run an action' }).success, false);
  assert.equal(metaSchema.safeParse({ label: '  ', description: 'Run an action' }).success, false);
});

const mutations = Object.entries<unknown>(appRouter._def.procedures).flatMap(([path, procedure]) =>
  isProcedure(procedure) && procedure._def.type === 'mutation' ? [{ path, procedure }] : [],
);

// Later steps derive LLM tools from this meta, so no action may lack it.
void test('every mutation carries an Italian label and an English description in its meta', () => {
  assert.deepEqual(mutations.map((m) => m.path).toSorted(), [
    'agents.create',
    'agents.revoke',
    'airplay.start',
    'airplay.stop',
    'audio.cycleOutput',
    'audio.setOutput',
    'audio.setVolume',
    'audio.stepVolume',
    'audio.toggleMicMute',
    'audio.toggleMute',
    'confirmations.confirm',
    'confirmations.deny',
    'devices.revoke',
    'jobs.cancel',
    'layout.reset',
    'layout.save',
    'media.next',
    'media.playPause',
    'media.previous',
    'media.seek',
    'music.addToPlaylist',
    'music.createPlaylist',
    'music.deletePlaylist',
    'music.movePlaylistSong',
    'music.play',
    'music.playPlaylist',
    'music.playPublicPlaylist',
    'music.removePlaylistSong',
    'music.renamePlaylist',
    'music.savePublicPlaylist',
    'music.skip',
    'music.toggleFavorite',
    'news.open',
    'news.refresh',
    'pairing.createCode',
    'pairing.redeem',
    'pomodoro.configure',
    'pomodoro.pause',
    'pomodoro.resume',
    'pomodoro.skip',
    'pomodoro.start',
    'pomodoro.stop',
    'settings.restore',
    'settings.save',
    'settings.saveCore',
    'study.activate',
    'study.openToday',
    'study.setAutonomy',
    'study.setCurrent',
    'study.setMix',
    'study.setNote',
    'study.setPlan',
    'study.setStep',
    'study.setSubject',
    'system.lock',
    'system.powerOff',
    'system.reboot',
    'system.suspend',
    'system.toggleWorkspace',
    'theme.delete',
    'theme.rename',
    'theme.save',
  ]);
  for (const { path, procedure } of mutations) {
    assert.ok(metaSchema.safeParse(procedure._def.meta).success, `${path} has no meta.label or meta.description`);
  }
});

void test('every danger mutation is refused without confirmed: true and runs with it', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() }, config: emptyConfig });
  t.after(() => app.close());
  const danger = mutations.filter(
    ({ procedure }) => z.object({ danger: z.literal(true) }).safeParse(procedure._def.meta).success,
  );
  assert.deepEqual(danger.map((m) => m.path).toSorted(), [
    'agents.revoke',
    'devices.revoke',
    'jobs.cancel',
    'music.deletePlaylist',
    'settings.restore',
    'system.powerOff',
    'system.reboot',
    'system.suspend',
    'theme.delete',
  ]);
  for (const { path } of danger) {
    const call = (input: object) =>
      app.inject({
        method: 'POST',
        url: `/trpc/${path}`,
        headers: { 'content-type': 'application/json' },
        payload: input,
      });
    // From the PC, so only the missing confirmation can refuse it. The ids do not exist (a delete answers 404) and the
    // fake desktop only records power commands (200): either way the action ran.
    assert.equal((await call({ id: 999, jobId: 'missing' })).statusCode, 412, path);
    assert.equal((await call({ id: 999, jobId: 'missing', confirmed: false })).statusCode, 412, path);
    assert.ok([200, 404].includes((await call({ id: 999, jobId: 'missing', confirmed: true })).statusCode), path);
  }
});
