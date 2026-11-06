import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { currentOutput, nextOutput, parsePwDump, parseVolume, resolveOutputs } from './pipewire.ts';

const dump = readFileSync(new URL('./fixtures/pw-dump.json', import.meta.url), 'utf8');
const { sinks, defaultName } = parsePwDump(dump);
const outputs = [
  { label: 'Cuffie', match: 'usb headset' },
  { label: 'Casse', match: 'Bluetooth Speaker' },
  { label: 'Monitor', match: 'HDMI Monitor' },
];
const resolved = resolveOutputs(sinks, outputs);

void test('parsePwDump keeps only audio sinks and reads the default sink name', () => {
  assert.deepEqual(sinks, [
    { id: 50, name: 'alsa_output.usb-headset.analog-stereo', description: 'USB Headset' },
    { id: 51, name: 'alsa_output.hdmi-monitor.hdmi-stereo', description: 'HDMI Monitor' },
  ]);
  assert.equal(defaultName, 'alsa_output.usb-headset.analog-stereo');
});

void test('parsePwDump gives an empty snapshot for output that is not a pw-dump', () => {
  assert.deepEqual(parsePwDump(''), { sinks: [], defaultName: null });
  assert.deepEqual(parsePwDump('{"not":"an array"}'), { sinks: [], defaultName: null });
});

void test('resolveOutputs matches case-insensitively and leaves missing devices without a sink', () => {
  assert.deepEqual(
    resolved.map((o) => [o.label, o.sink?.id ?? null]),
    [
      ['Cuffie', 50],
      ['Casse', null],
      ['Monitor', 51],
    ],
  );
});

void test('currentOutput resolves the default sink to its label', () => {
  assert.equal(currentOutput(resolved, defaultName)?.label, 'Cuffie');
  assert.equal(currentOutput(resolved, 'alsa_output.unknown'), null);
});

void test('nextOutput skips unavailable outputs and wraps around', () => {
  assert.equal(nextOutput(resolved, 'alsa_output.usb-headset.analog-stereo')?.label, 'Monitor');
  assert.equal(nextOutput(resolved, 'alsa_output.hdmi-monitor.hdmi-stereo')?.label, 'Cuffie');
});

void test('nextOutput picks the first available output when the current sink matches none', () => {
  assert.equal(nextOutput(resolved, 'alsa_output.unknown')?.label, 'Cuffie');
  assert.equal(nextOutput(resolved, null)?.label, 'Cuffie');
});

void test('nextOutput is null when no configured output is available', () => {
  assert.equal(nextOutput(resolveOutputs([], outputs), null), null);
});

void test('parseVolume parses normal volume, muted volume, and returns null for missing or invalid output', () => {
  assert.deepEqual(parseVolume('Volume: 0.85\n'), { volume: 0.85, muted: false });
  assert.deepEqual(parseVolume('Volume: 0.85 [MUTED]\n'), { volume: 0.85, muted: true });
  assert.deepEqual(parseVolume('Volume: 1.25\n'), { volume: 1, muted: false });
  assert.deepEqual(parseVolume('Volume: 0.00\n'), { volume: 0, muted: false });
  assert.equal(parseVolume(''), null);
  assert.equal(parseVolume('error: device not found\n'), null);
});
