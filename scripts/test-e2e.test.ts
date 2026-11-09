import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planStages } from './test-e2e.ts';

void test('the public pass is split in one shard per worker and never runs the example modules', () => {
  const [public_] = planStages(2);
  assert.deepEqual(
    public_?.map((job) => job.args.at(-1)),
    ['--shard=1/2', '--shard=2/2'],
  );
  assert.ok(public_?.every((job) => job.env.HUB_EXAMPLE_MODULES === undefined));
});

void test('the example pass and the private pass share the second stage, so no stage exceeds the worker count', () => {
  const stages = planStages(2);
  assert.equal(stages.length, 2);
  assert.ok(stages.every((stage) => stage.length <= 2));
  const [example, priv] = stages[1] ?? [];
  assert.equal(example?.env.HUB_EXAMPLE_MODULES, '1');
  assert.deepEqual(priv?.args, ['scripts/test-e2e-private.ts']);
});
