import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { z } from '../../core/module.ts';
import { planSchema, planShape } from './plan.ts';
import { orderDays } from './order.ts';

const plan: z.input<typeof planSchema> = {
  schema: 'hub.study-plan/1',
  id: 'example',
  title: 'Example',
  version: 1,
  subjects: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  threads: [{ id: 'a-topic', subject: 'a', title: 'Topic' }],
  phases: [{ id: 'first', title: 'First' }],
  method: [],
  days: [
    {
      id: 'a1',
      subject: 'a',
      phase: 'first',
      title: 'Day',
      threads: ['a-topic'],
      recall: [],
      kind: 'study',
      blocks: [{ id: 'block', title: 'Block', steps: [{ id: 'step', text: 'Read' }] }],
      check: 'Review',
    },
  ],
};

void test('rejects unsafe ids at every level and accepts dotted ids', () => {
  for (const invalidId of ['a/b', 'a:b', '..', '.x', '*', 'a'.repeat(65)]) {
    const invalid = structuredClone(plan);
    invalid.id = invalidId;
    invalid.subjects[0].id = invalidId;
    invalid.threads[0].id = invalidId;
    invalid.phases[0].id = invalidId;
    invalid.days[0].id = invalidId;
    invalid.days[0].blocks[0].id = invalidId;
    invalid.days[0].blocks[0].steps[0].id = invalidId;
    const result = planSchema.safeParse(invalid);
    assert.equal(result.success, false);
    if (!result.success) {
      for (const path of [
        'id',
        'subjects.0.id',
        'threads.0.id',
        'phases.0.id',
        'days.0.id',
        'days.0.blocks.0.id',
        'days.0.blocks.0.steps.0.id',
      ]) {
        assert.ok(
          result.error.issues.some((issue) => issue.path.join('.') === path),
          path,
        );
      }
    }
  }
  const dotted = structuredClone(plan);
  dotted.days[0].blocks[0].id = 'C01.f.1';
  assert.equal(planSchema.safeParse(dotted).success, true);
});

void test('validates references, stable ids and phase membership', () => {
  assert.equal(
    planSchema.safeParse(JSON.parse(readFileSync(new URL('./fixtures/example.json', import.meta.url), 'utf8'))).success,
    true,
  );
  assert.equal(planSchema.safeParse(plan).success, true);
  const invalid = structuredClone(plan);
  invalid.days[0].threads = ['missing'];
  invalid.days[0].recall = ['missing'];
  invalid.days[0].phase = 'missing';
  invalid.days[0].blocks[0].steps.push({ id: 'step', text: 'Duplicate' });
  const result = planSchema.safeParse(invalid);
  assert.equal(result.success, false);
  if (!result.success) {
    for (const path of ['days.0.threads.0', 'days.0.recall.0', 'days.0.phase', 'days.0.blocks.0.steps.1.id']) {
      assert.ok(
        result.error.issues.some((issue) => issue.path.join('.') === path),
        path,
      );
    }
  }
  assert.equal(planSchema.safeParse({ ...plan, days: [{ ...plan.days[0], phase: undefined }] }).success, false);
  assert.equal(planSchema.safeParse({ ...plan, phases: [] }).success, false);
  assert.equal(planSchema.safeParse({ ...plan, days: [{ ...plan.days[0], g: 1 }] }).success, false);
  assert.equal(planSchema.safeParse({ ...plan, days: [{ ...plan.days[0], date: '2026-01-01' }] }).success, false);
  const missingId = planSchema.safeParse({
    ...plan,
    days: [{ ...plan.days[0], blocks: [{ id: 'block', title: 'Block', steps: [{ text: 'Missing id' }] }] }],
  });
  assert.equal(missingId.success, false);
  if (!missingId.success)
    assert.ok(
      missingId.error.issues.some(
        (issue) => issue.path.join('.') === 'days.0.blocks.0.steps.0.id' && issue.message.length > 0,
      ),
    );
});

void test('G numbers follow subject pause and restore when resumed', () => {
  const days = [
    { id: 'a1', subject: 'a', done: false },
    { id: 'b1', subject: 'b', done: false },
    { id: 'a2', subject: 'a', done: false },
  ];
  const numbered = (states: Record<string, string>) => orderDays(days, states, null).map((day, i) => [day.id, i + 1]);
  assert.deepEqual(numbered({ b: 'paused' }), [
    ['a1', 1],
    ['a2', 2],
  ]);
  assert.deepEqual(numbered({ b: 'active' }), [
    ['a1', 1],
    ['b1', 2],
    ['a2', 3],
  ]);
});

void test('published JSON Schema matches the plan shape', () => {
  const published = JSON.parse(
    readFileSync(new URL('../../../../../docs/study-plan.schema.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(published, z.toJSONSchema(planShape, { io: 'input' }));
});
