import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Run } from '../../core/exec.ts';
import { createMonitorLive, parseMonitors, readMonitors } from './monitor.ts';

const fixture = readFileSync(new URL('fixtures/monitors.json', import.meta.url), 'utf8');
const entries = [
  { output: 'DP-1', label: 'Principale', command: 'unused' },
  { output: 'DP-2', label: 'Secondo', command: 'unused' },
  { output: 'DP-3', label: 'Terzo', command: 'unused' },
];

void test('one read gives on, off and absent for several entries', () => {
  assert.deepEqual(parseMonitors(fixture, entries), [
    { output: 'DP-1', label: 'Principale', state: 'on' },
    { output: 'DP-2', label: 'Secondo', state: 'off' },
    { output: 'DP-3', label: 'Terzo', state: 'absent' },
  ]);
});

void test('a garbled or reshaped answer is unknown for every entry, never a throw', () => {
  for (const bad of ['', 'not json', '{}', '[{"name":"DP-1"}]', '[{"name":1,"disabled":false}]'])
    assert.deepEqual(
      parseMonitors(bad, entries).map(({ state }) => state),
      ['unknown', 'unknown', 'unknown'],
      bad,
    );
});

void test('a failing hyprctl is unknown, and no entry means no read', async () => {
  const calls: string[][] = [];
  const failing: Run = (bin, args) => {
    calls.push([bin, ...args]);
    return Promise.resolve({ stdout: fixture, stderr: 'boom', code: 1 });
  };
  assert.equal((await readMonitors(failing, entries))[0]?.state, 'unknown');
  assert.deepEqual(calls, [['hyprctl', 'monitors', 'all', '-j']]);
  assert.deepEqual(await readMonitors(failing, []), []);
  assert.equal(calls.length, 1);
});

void test('a change made outside Hub reaches a subscriber at the next poll', async () => {
  let disabled = true;
  const run: Run = () => Promise.resolve({ stdout: JSON.stringify([{ name: 'DP-1', disabled }]), stderr: '', code: 0 });
  const live = createMonitorLive(run, entries.slice(0, 1), 10);
  const seen: string[] = [];
  for await (const states of live.subscribe()) {
    seen.push(states[0]?.state ?? '');
    if (seen.length === 1) disabled = false;
    else break;
  }
  assert.deepEqual(seen, ['off', 'on']);
});
