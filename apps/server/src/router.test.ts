/* oxlint-disable no-underscore-dangle -- tRPC exposes procedure type and meta only through _def */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AnyProcedure } from '@trpc/server';
import { z } from 'zod';
import { emptyConfig } from './core/config.ts';
import { appRouter } from './router.ts';
import { buildServer } from './server.ts';
import { createFakeDesktop } from './testing/fake-desktop.ts';

// tRPC types `_def.procedures` as the nested router tree but fills it with a flat path-to-procedure map.
function isProcedure(value: unknown): value is AnyProcedure {
  return typeof value === 'function';
}

process.env.NODE_ENV = 'test';

const metaSchema = z.object({ description: z.string().min(1) });

const mutations = Object.entries<unknown>(appRouter._def.procedures).flatMap(([path, procedure]) =>
  isProcedure(procedure) && procedure._def.type === 'mutation' ? [{ path, procedure }] : [],
);

// Later steps derive LLM tools from this meta, so no action may lack it.
void test('every mutation carries a description in its meta', () => {
  assert.deepEqual(mutations.map((m) => m.path).toSorted(), [
    'audio.cycleOutput',
    'devices.revoke',
    'layout.reset',
    'layout.save',
    'media.next',
    'media.playPause',
    'media.previous',
    'pairing.createCode',
    'pairing.redeem',
    'pomodoro.configure',
    'pomodoro.pause',
    'pomodoro.resume',
    'pomodoro.skip',
    'pomodoro.start',
    'pomodoro.stop',
    'theme.delete',
    'theme.rename',
    'theme.save',
  ]);
  for (const { path, procedure } of mutations) {
    assert.ok(metaSchema.safeParse(procedure._def.meta).success, `${path} has no meta.description`);
  }
});

void test('every danger mutation is refused without confirmed: true and runs with it', async (t) => {
  const app = buildServer({ dbPath: ':memory:', run: createFakeDesktop(), config: emptyConfig });
  t.after(() => app.close());
  const danger = mutations.filter(
    ({ procedure }) => z.object({ danger: z.literal(true) }).safeParse(procedure._def.meta).success,
  );
  assert.deepEqual(
    danger.map((m) => m.path),
    ['devices.revoke', 'theme.delete'],
  );
  for (const { path } of danger) {
    const call = (input: object) =>
      app.inject({
        method: 'POST',
        url: `/trpc/${path}`,
        headers: { 'content-type': 'application/json' },
        payload: input,
      });
    // From the PC, so only the missing confirmation can refuse it; the ids do not exist, so a run answers 404.
    assert.equal((await call({ id: 999 })).statusCode, 412, path);
    assert.equal((await call({ id: 999, confirmed: false })).statusCode, 412, path);
    assert.equal((await call({ id: 999, confirmed: true })).statusCode, 404, path);
  }
});
