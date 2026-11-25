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
    { output: 'DP-1', label: 'Principale', state: 'on', orientation: 'horizontal' },
    { output: 'DP-2', label: 'Secondo', state: 'off', orientation: null },
    { output: 'DP-3', label: 'Terzo', state: 'absent', orientation: null },
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

void test('orientation follows transform parity only for an enabled, listed monitor', () => {
  const entry = [{ output: 'TEST-1', label: 'Monitor', command: 'unused' }];
  for (const transform of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const stdout = JSON.stringify([{ name: 'TEST-1', disabled: false, transform }]);
    assert.equal(parseMonitors(stdout, entry)[0]?.orientation, transform % 2 === 1 ? 'vertical' : 'horizontal');
  }
  for (const stdout of [
    '',
    '[]',
    '[{"name":"TEST-1","disabled":false}]',
    '[{"name":"TEST-1","disabled":true,"transform":3}]',
  ]) {
    assert.equal(parseMonitors(stdout, entry)[0]?.orientation, null);
  }
});

void test('readMonitors exposes capabilities without exposing configured commands', async () => {
  const run: Run = () => Promise.resolve({ stdout: '[]', stderr: '', code: 0 });
  const configured = [
    { output: 'TEST-1', label: 'Monitor', command: 'toggle-script', horizontalCommand: 'horizontal-script' },
    { output: 'TEST-2', label: 'Other', command: 'toggle-script', verticalCommand: 'vertical-script' },
  ];
  assert.deepEqual(await readMonitors(run, configured), [
    {
      output: 'TEST-1',
      label: 'Monitor',
      state: 'absent',
      orientation: null,
      supportsHorizontal: true,
      supportsVertical: false,
    },
    {
      output: 'TEST-2',
      label: 'Other',
      state: 'absent',
      orientation: null,
      supportsHorizontal: false,
      supportsVertical: true,
    },
  ]);
});
