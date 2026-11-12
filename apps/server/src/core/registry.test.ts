import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { listActions } from './registry.ts';
import { protectedProcedure, router } from './trpc.ts';

void test('only queries with metadata join mutations in the registry', () => {
  const app = router({
    action: protectedProcedure.meta({ label: 'Azione', description: 'Run an action' }).mutation(() => null),
    query: protectedProcedure.meta({ label: 'Lettura', description: 'Read a value' }).query(() => null),
    privateQuery: protectedProcedure.query(() => null),
    subscription: protectedProcedure
      .meta({ label: 'Eventi', description: 'Read events' })
      .subscription(async function* () {}),
  });
  assert.deepEqual(
    listActions(app).map(({ path, kind }) => ({ path, kind })),
    [
      { path: 'action', kind: 'mutation' },
      { path: 'query', kind: 'query' },
    ],
  );
});

void test('unrepresentable parsers stay discoverable with a non-runnable schema', () => {
  const app = router({
    opaque: protectedProcedure
      .meta({ label: 'Azione opaca', description: 'Accept an opaque input' })
      .input(z.custom<string>())
      .mutation(() => null),
  });
  assert.deepEqual(listActions(app)[0]?.schema, { type: 'object', not: {} });
});

void test('composed inputs retain every constraint rather than claiming to be a flat form', () => {
  const app = router({
    combined: protectedProcedure
      .meta({ label: 'Azione composta', description: 'Accept composed inputs' })
      .input(z.object({ first: z.string().min(2) }))
      .input(z.object({ second: z.number().min(1) }))
      .mutation(() => null),
  });
  const schema = listActions(app)[0]?.schema;
  assert.ok(schema && 'allOf' in schema);
  assert.equal(schema.type, 'object');
  assert.equal(schema.allOf?.length, 2);
});

// Private modules are not type-checked by the repo: one action without a label must not empty the whole palette.
void test('an action without valid metadata is skipped and the others are still listed', () => {
  const app = router({
    good: protectedProcedure.meta({ label: 'Azione buona', description: 'Run a good action' }).mutation(() => null),
    // @ts-expect-error -- simulates a private module that the repository typecheck never sees
    bad: protectedProcedure.meta({ description: 'Missing its label' }).mutation(() => null),
  });
  assert.deepEqual(
    listActions(app).map((action) => action.path),
    ['good'],
  );
});
