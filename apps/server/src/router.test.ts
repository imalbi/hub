/* oxlint-disable no-underscore-dangle -- tRPC exposes procedure type and meta only through _def */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AnyProcedure } from '@trpc/server';
import { z } from 'zod';
import { appRouter } from './router.ts';

// tRPC types `_def.procedures` as the nested router tree but fills it with a flat path-to-procedure map.
function isProcedure(value: unknown): value is AnyProcedure {
  return typeof value === 'function';
}

const metaSchema = z.object({ description: z.string().min(1) });

// Later steps derive LLM tools and the danger check from this meta, so no action may lack it.
void test('every mutation carries a description in its meta', () => {
  const mutations = Object.entries<unknown>(appRouter._def.procedures).flatMap(([path, procedure]) =>
    isProcedure(procedure) && procedure._def.type === 'mutation' ? [{ path, procedure }] : [],
  );
  assert.deepEqual(mutations.map((m) => m.path).toSorted(), [
    'audio.cycleOutput',
    'devices.revoke',
    'media.next',
    'media.playPause',
    'media.previous',
    'pairing.createCode',
    'pairing.redeem',
    'pomodoro.pause',
    'pomodoro.resume',
    'pomodoro.skip',
    'pomodoro.start',
    'pomodoro.stop',
  ]);
  for (const { path, procedure } of mutations) {
    assert.ok(metaSchema.safeParse(procedure._def.meta).success, `${path} has no meta.description`);
  }
});
