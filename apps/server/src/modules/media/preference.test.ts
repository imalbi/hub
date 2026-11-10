import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Run } from '../../core/exec.ts';
import { playerArgs } from './preference.ts';

void test('mpv wins only while playing or paused', async () => {
  for (const [status, expected] of [
    ['Playing', ['--player=mpv']],
    ['Paused', ['--player=mpv']],
    ['Stopped', []],
    ['', []],
  ] satisfies [string, string[]][]) {
    const run: Run = () => Promise.resolve({ stdout: status, stderr: '', code: status ? 0 : 1 });
    assert.deepEqual(await playerArgs(run), expected);
  }
});
