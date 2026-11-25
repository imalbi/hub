import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MonitorConfig } from './config.ts';
import { configSchema } from './config.ts';
import { emptyConfig } from '../../core/config.ts';
import { buildServer } from '../../server.ts';
import { createFakeDesktop, fakeMonitors } from '../../testing/fake-desktop.ts';

process.env.NODE_ENV = 'test';

const monitors = [
  { output: 'DP-1', label: 'Principale', command: 'fake-monitor-DP-1' },
  { output: 'DP-2', label: 'Secondo', command: 'fake-monitor-DP-2' },
];

function setup(t: test.TestContext, configured: MonitorConfig[] = monitors, state = fakeMonitors()) {
  const system: string[][] = [];
  const app = buildServer({
    dbPath: ':memory:',
    deps: { run: createFakeDesktop({ system, monitors: state }) },
    config: { ...emptyConfig, system: { monitors: configured } },
  });
  t.after(() => app.close());
  const call = (path: string, input: object = {}, remoteAddress?: string) =>
    app.inject({
      method: 'POST',
      url: `/trpc/system.${path}`,
      headers: { 'content-type': 'application/json' },
      payload: input,
      remoteAddress,
    });
  return { system, call, app };
}

void test('each action runs its exact command through the fake desktop', async (t) => {
  const { system, call } = setup(t);
  assert.equal((await call('lock')).statusCode, 200);
  assert.equal((await call('toggleWorkspace', { name: 'communication' })).statusCode, 200);
  assert.equal((await call('toggleWorkspace', { name: 'music' })).statusCode, 200);
  assert.equal((await call('toggleWorkspace', { name: 'hub' })).statusCode, 200);
  for (const path of ['suspend', 'reboot', 'powerOff'])
    assert.equal((await call(path, { confirmed: true })).statusCode, 200, path);
  assert.deepEqual(system, [
    ['caelestia', 'shell', 'lock', 'lock'],
    ['caelestia', 'toggle', 'communication'],
    ['caelestia', 'toggle', 'music'],
    ['caelestia', 'toggle', 'hub'],
    ['systemctl', 'suspend'],
    ['systemctl', 'reboot'],
    ['systemctl', 'poweroff'],
  ]);
});

void test('power actions need the hold confirmation; workspaces outside the list and the LAN are refused', async (t) => {
  const { system, call } = setup(t);
  for (const path of ['suspend', 'reboot', 'powerOff']) assert.equal((await call(path)).statusCode, 412, path);
  assert.equal((await call('toggleWorkspace', { name: 'unknown' })).statusCode, 400);
  assert.equal((await call('lock', {}, '192.0.2.20')).statusCode, 401);
  assert.deepEqual(system, []);
});

void test('without a powerstat directory the consumption is null', async (t) => {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() }, config: emptyConfig });
  t.after(() => app.close());
  const response = await app.inject('/trpc/system.power');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { result: { data: null } });
});

void test('the toggle runs the command of the monitor it names, with no arguments, and only that one', async (t) => {
  const state = fakeMonitors();
  const { system, call } = setup(t, monitors, state);
  assert.equal((await call('monitor.toggle', { output: 'DP-2' })).statusCode, 200);
  assert.deepEqual(system, [['fake-monitor-DP-2']]);
  assert.equal(state['DP-2'], false);
  assert.equal(state['DP-1'], false);
  assert.equal((await call('monitor.toggle', { output: 'DP-1' })).statusCode, 200);
  assert.deepEqual(system, [['fake-monitor-DP-2'], ['fake-monitor-DP-1']]);
  assert.equal(state['DP-1'], true);
});

void test('an output outside the list is refused, and an empty list answers 412 with nothing run', async (t) => {
  const { system, call } = setup(t);
  assert.equal((await call('monitor.toggle', { output: 'DP-9' })).statusCode, 400);
  assert.equal((await call('monitor.toggle', {})).statusCode, 400);
  assert.deepEqual(system, []);
  const none = setup(t, []);
  assert.equal((await none.call('monitor.toggle', { output: 'DP-1' })).statusCode, 412);
  assert.deepEqual(none.system, []);
  const state = await none.app.inject('/trpc/system.monitors');
  assert.deepEqual(state.json(), { result: { data: [] } });
});

void test('a failing command is a server error, and the state query reads every configured entry at once', async (t) => {
  const { call } = setup(t, [{ output: 'DP-1', label: 'Principale', command: 'missing-script' }]);
  assert.equal((await call('monitor.toggle', { output: 'DP-1' })).statusCode, 500);
  const both = setup(t);
  const response = await both.app.inject('/trpc/system.monitors');
  assert.deepEqual(response.json().result.data, [
    {
      output: 'DP-1',
      label: 'Principale',
      state: 'on',
      orientation: 'horizontal',
      supportsHorizontal: false,
      supportsVertical: false,
    },
    {
      output: 'DP-2',
      label: 'Secondo',
      state: 'off',
      orientation: null,
      supportsHorizontal: false,
      supportsVertical: false,
    },
  ]);
});

void test('orientation runs only the configured command, without arguments', async (t) => {
  const output = 'DP-1';
  const { call, system, app } = setup(t, [
    {
      output,
      label: 'Monitor',
      command: 'unused',
      horizontalCommand: `fake-horizontal-${output}`,
      verticalCommand: `fake-vertical-${output}`,
    },
  ]);
  for (const orientation of ['vertical', 'horizontal']) {
    assert.equal((await call('monitor.setOrientation', { output, orientation })).statusCode, 200);
    assert.equal((await app.inject('/trpc/system.monitors')).json().result.data[0].orientation, orientation);
  }
  assert.deepEqual(system, [[`fake-vertical-${output}`], [`fake-horizontal-${output}`]]);
});

void test('missing orientation commands and outputs fail closed, invalid input and LAN are refused', async (t) => {
  const output = 'DP-1';
  const { call, system } = setup(t, [
    { output, label: 'Monitor', command: 'unused', horizontalCommand: 'missing-script' },
  ]);
  assert.equal((await call('monitor.setOrientation', { output, orientation: 'vertical' })).statusCode, 412);
  assert.equal(
    (await call('monitor.setOrientation', { output: 'unknown', orientation: 'horizontal' })).statusCode,
    412,
  );
  assert.equal((await call('monitor.setOrientation', { output, orientation: 'diagonal' })).statusCode, 400);
  assert.equal((await call('monitor.setOrientation', { output })).statusCode, 400);
  assert.equal(
    (await call('monitor.setOrientation', { output, orientation: 'horizontal' }, '192.0.2.20')).statusCode,
    401,
  );
  assert.deepEqual(system, []);
  assert.equal((await call('monitor.setOrientation', { output, orientation: 'horizontal' })).statusCode, 500);
});

void test('orientation config remains optional, nonempty and manual', () => {
  const schema = configSchema.unwrap().shape.monitors.unwrap().element;
  for (const field of [schema.shape.horizontalCommand, schema.shape.verticalCommand]) {
    assert.equal(field.meta()?.manual, true);
    assert.equal(field.safeParse(undefined).success, true);
    assert.equal(field.safeParse('').success, false);
  }
});
