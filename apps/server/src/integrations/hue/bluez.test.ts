import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createFakeBluez, type FakeLight } from '../../testing/fake-bluez.ts';
import { createHueBluez } from './bluez.ts';
import { rawToPercent } from './contracts.ts';

const light = (address: string, change: Partial<FakeLight> = {}): FakeLight => ({
  address,
  paired: true,
  connected: false,
  power: 1,
  brightness: 254,
  hasBrightness: true,
  ...change,
});

// Every fake call resolves in the same macrotask, so a few turns of the event loop run a whole step.
async function flush() {
  for (let turn = 0; turn < 3; turn++) await setImmediate();
}

async function tick(ms: number) {
  mock.timers.tick(ms);
  await flush();
}

function setup(
  t: test.TestContext,
  lights: FakeLight[] = [light('light-a')],
  options: { address?: string; unrelated?: string[] } = {},
) {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const fake = createFakeBluez(lights, { unrelatedPaired: options.unrelated });
  const warnings: string[] = [];
  const hue = createHueBluez({ run: fake.run, address: options.address, onWarn: (message) => warnings.push(message) });
  return { hue, fake, lights, warnings };
}

async function ready(t: test.TestContext, lights?: FakeLight[], options?: Parameters<typeof setup>[2]) {
  const env = setup(t, lights, options);
  env.hue.readState();
  await flush();
  assert.equal(env.hue.readState().availability, 'ready');
  return env;
}

void test('nothing runs until the first use, which connects, reads and reports the light in percent', async (t) => {
  const { hue, fake } = setup(t);
  assert.equal(fake.calls.length, 0);
  assert.equal(hue.readState().availability, 'connecting');
  await flush();
  assert.equal(fake.count('Connect'), 1);
  assert.deepEqual(hue.readState(), {
    availability: 'ready',
    power: true,
    brightnessPercent: 100,
    model: 'LWA001',
    capabilities: { power: true, brightness: true },
  });
});

void test('a light that is already connected is not asked to connect again, and only one attempt runs at a time', async (t) => {
  const { hue, fake } = setup(t, [light('light-a', { connected: true })]);
  hue.readState();
  hue.watch();
  void hue.execute({ type: 'setPower', on: true }).catch(() => {});
  await flush();
  assert.equal(fake.count('Connect'), 0);
  assert.equal(fake.count('GetManagedObjects'), 1);
});

void test('a configured address picks that light, whatever the case, and no other', async (t) => {
  const { hue, fake } = setup(t, [light('light-a'), light('light-b')], { address: 'LIGHT-B' });
  hue.readState();
  await flush();
  const connects = fake.calls.filter((call) => call.method === 'Connect');
  assert.equal(connects.length, 1);
  assert.match(connects[0]?.path ?? '', /dev_light-b$/);
});

void test('without an address it takes the only paired Hue light and ignores other paired devices', async (t) => {
  const { hue } = setup(t, [light('light-a')], { unrelated: ['headphones'] });
  hue.readState();
  await flush();
  assert.equal(hue.readState().availability, 'ready');
});

void test('two paired Hue lights and no address is unavailable: it never guesses, never connects, never writes', async (t) => {
  const { hue, fake } = setup(t, [light('light-a'), light('light-b')]);
  hue.readState();
  await flush();
  assert.equal(hue.readState().availability, 'unavailable');
  await assert.rejects(hue.execute({ type: 'setPower', on: false }), { code: 'unavailable' });
  for (const method of ['Connect', 'ReadValue', 'WriteValue']) assert.equal(fake.count(method), 0, method);
});

void test('a light that is not paired is never connected, which would start pairing', async (t) => {
  const { hue, fake } = setup(t, [light('light-a', { paired: false })]);
  hue.readState();
  await flush();
  assert.equal(hue.readState().availability, 'unavailable');
  assert.equal(fake.count('Connect'), 0);
});

void test('a failing connect is retried at 1, 2, 5 then 30 seconds while watched and recovers', async (t) => {
  const { hue, fake } = setup(t);
  fake.breakMethod('Connect');
  hue.watch();
  await tick(0);
  assert.equal(fake.count('Connect'), 1);
  await tick(999);
  assert.equal(fake.count('Connect'), 1);
  await tick(1);
  assert.equal(fake.count('Connect'), 2);
  await tick(2_000);
  assert.equal(fake.count('Connect'), 3);
  await tick(5_000);
  assert.equal(fake.count('Connect'), 4);
  await tick(30_000);
  assert.equal(fake.count('Connect'), 5);
  await tick(30_000);
  assert.equal(fake.count('Connect'), 6);
  fake.heal();
  await tick(30_000);
  assert.equal(hue.readState().availability, 'ready');
});

// A lamp switched off at the wall must not cost a Bluetooth connect every 30 s for as long as Hub runs.
void test('with nobody watching a failed connect is not retried until the light is asked for again', async (t) => {
  const { hue, fake } = setup(t);
  fake.breakMethod('Connect');
  hue.readState();
  await tick(0);
  assert.equal(fake.count('Connect'), 1);
  await tick(120_000);
  assert.equal(fake.count('Connect'), 1, 'no background retries');
  fake.heal();
  hue.readState();
  await tick(0);
  assert.equal(hue.readState().availability, 'ready');
});

void test('it refreshes only while watched, and a power-off made elsewhere shows up without any push', async (t) => {
  const { hue, fake, lights } = await ready(t);
  const reads = fake.count('ReadValue');
  await tick(60_000);
  assert.equal(fake.count('ReadValue'), reads, 'unwatched: no polling');
  const changes: boolean[] = [];
  hue.subscribe(() => changes.push(hue.readState().power === false));
  const release = hue.watch();
  await tick(0);
  assert.ok(fake.count('ReadValue') > reads, 'watching refreshes at once');
  const [first] = lights;
  assert.ok(first);
  first.power = 0; // Echo switched it off and BlueZ got no notification we listen to
  await tick(5_000);
  assert.equal(hue.readState().power, false);
  assert.ok(changes.includes(true));
  release();
  const settled = fake.count('ReadValue');
  await tick(30_000);
  assert.equal(fake.count('ReadValue'), settled, 'released: polling stops');
});

void test('a failed read makes the light unavailable with its last values, then reconnects on the backoff', async (t) => {
  const { hue, fake, lights } = await ready(t);
  hue.watch();
  fake.breakMethod('ReadValue');
  await tick(5_000);
  assert.deepEqual(hue.readState(), {
    availability: 'unavailable',
    power: true,
    brightnessPercent: 100,
    model: 'LWA001',
    capabilities: { power: true, brightness: true },
  });
  fake.heal();
  const [first] = lights;
  assert.ok(first);
  first.connected = false;
  first.brightness = 100;
  await tick(1_000);
  assert.equal(hue.readState().availability, 'ready');
  assert.equal(hue.readState().brightnessPercent, rawToPercent(100));
});

void test('commands write the right byte to the right characteristic and report what the light now holds', async (t) => {
  const { hue, fake } = await ready(t);
  await hue.execute({ type: 'setPower', on: false });
  await hue.execute({ type: 'setBrightness', percent: 50 });
  const [power, brightness] = fake.writes();
  assert.match(power?.path ?? '', /char0011$/);
  assert.equal(power?.byte, 0);
  assert.match(brightness?.path ?? '', /char0013$/);
  assert.equal(brightness?.byte, 126);
  assert.equal(hue.readState().power, false);
  assert.equal(hue.readState().brightnessPercent, 50);
});

void test('a command is refused before any write while the light is not ready', async (t) => {
  const { hue, fake } = setup(t);
  await assert.rejects(hue.execute({ type: 'setPower', on: true }), { code: 'unavailable' });
  assert.equal(fake.count('WriteValue'), 0);
});

void test('a feature the light lacks is refused before any write', async (t) => {
  const { hue, fake } = await ready(t, [light('light-a', { hasBrightness: false })]);
  assert.deepEqual(hue.readState().capabilities, { power: true, brightness: false });
  await assert.rejects(hue.execute({ type: 'setBrightness', percent: 50 }), { code: 'unsupported' });
  assert.equal(fake.count('WriteValue'), 0);
});

void test('two callers are serialized: each write is read back before the next one goes out', async (t) => {
  const { hue, fake } = await ready(t);
  await Promise.all([
    hue.execute({ type: 'setPower', on: false }),
    hue.execute({ type: 'setBrightness', percent: 10 }),
  ]);
  const sequence = fake.calls.map((call) => call.method).slice(-6);
  assert.deepEqual(sequence, ['WriteValue', 'ReadValue', 'ReadValue', 'WriteValue', 'ReadValue', 'ReadValue']);
});

void test('a write that fails is a classified error and the light goes unavailable', async (t) => {
  const { hue, fake } = await ready(t);
  fake.breakMethod('WriteValue');
  await assert.rejects(hue.execute({ type: 'setPower', on: false }), { code: 'failed' });
  assert.equal(hue.readState().availability, 'unavailable');
});

void test('a write that times out is reported as a timeout, with the 15 second deadline handed to the call', async (t) => {
  const { hue, fake } = await ready(t);
  fake.breakMethod('WriteValue', 'hang');
  await assert.rejects(hue.execute({ type: 'setPower', on: false }), { code: 'timeout' });
  assert.equal(fake.timeouts.find((entry) => entry.method === 'WriteValue')?.timeoutMs, 15_000);
});

void test('a command queued behind a failing one is never executed on the connection that replaces it', async (t) => {
  const { hue, fake } = await ready(t);
  fake.breakMethod('WriteValue', 'hang');
  const first = hue.execute({ type: 'setPower', on: false });
  const second = hue.execute({ type: 'setBrightness', percent: 10 });
  await Promise.all([assert.rejects(first, { code: 'timeout' }), assert.rejects(second, { code: 'unavailable' })]);
  fake.heal();
  hue.readState(); // unwatched, the next use reconnects
  await tick(0);
  assert.equal(hue.readState().availability, 'ready');
  // Only the first command was ever attempted (byte 0); the queued brightness write never was, even after the reconnect.
  assert.deepEqual(
    fake.writes().map((write) => write.byte),
    [0],
  );
});

void test('subscribers hear about a change once and not about a refresh that found nothing new', async (t) => {
  const { hue, lights } = await ready(t);
  let calls = 0;
  hue.subscribe(() => calls++);
  hue.watch();
  await tick(5_000);
  await tick(5_000);
  assert.equal(calls, 0);
  const [first] = lights;
  assert.ok(first);
  first.brightness = 127;
  await tick(5_000);
  assert.equal(calls, 1);
});

void test('close disconnects the light it connected, stops every timer and refuses further commands', async (t) => {
  const { hue, fake } = await ready(t);
  hue.watch();
  await hue.close();
  assert.equal(fake.count('Disconnect'), 1);
  const calls = fake.calls.length;
  await tick(120_000);
  assert.equal(fake.calls.length, calls);
  await assert.rejects(hue.execute({ type: 'setPower', on: true }), { code: 'unavailable' });
});
