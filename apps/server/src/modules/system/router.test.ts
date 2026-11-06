import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyConfig } from '../../core/config.ts';
import { buildServer } from '../../server.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';

process.env.NODE_ENV = 'test';

function setup(t: test.TestContext) {
  const system: string[][] = [];
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop({ system }) }, config: emptyConfig });
  t.after(() => app.close());
  const call = (path: string, input: object = {}, remoteAddress?: string) =>
    app.inject({
      method: 'POST',
      url: `/trpc/system.${path}`,
      headers: { 'content-type': 'application/json' },
      payload: input,
      remoteAddress,
    });
  return { system, call };
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
