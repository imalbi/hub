import assert from 'node:assert/strict';
import { test } from 'node:test';
import { poseOffset, SCENES, type EmptyStateScene } from './empty-state-scenes.ts';

const EXPECTED_SCENES: EmptyStateScene[] = [
  'inbox',
  'search',
  'done',
  'offline',
  'chart',
  'music',
  'calendar',
  'notes',
];

void test('SCENES exposes all expected scenes with valid isometric SVG geometry', () => {
  assert.deepEqual(Object.keys(SCENES).toSorted(), [...EXPECTED_SCENES].toSorted());

  for (const name of EXPECTED_SCENES) {
    const def = SCENES[name]();
    assert.ok(def.shapes.length > 0, `${name} must define at least one shape`);
    assert.ok(
      def.shapes.some((shape) => shape.hero),
      `${name} must mark at least one hero shape`,
    );

    for (const shape of def.shapes) {
      assert.ok(shape.d.startsWith('M'), `${name} shape path must start with M`);
      assert.ok(!/NaN|Infinity/.test(shape.d), `${name} shape path contains non-finite numbers: ${shape.d}`);
    }

    for (const key of ['pending', 'success'] as const) {
      const pose = def.poses?.[key];
      if (!pose) continue;
      const [dx, dy] = poseOffset(pose);
      assert.ok(Number.isFinite(dx) && Number.isFinite(dy), `${name}.${key} pose must project to finite coordinates`);
    }
  }
});
