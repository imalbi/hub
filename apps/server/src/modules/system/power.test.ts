import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createPowerLive, parsePowerStatus, parseTodayKwh } from './power.ts';

const fixtures = new URL('fixtures/powerstat/', import.meta.url);
const status = readFileSync(new URL('status.json', fixtures), 'utf8');
const samples = readFileSync(new URL('samples.csv', fixtures), 'utf8');
// The fixture status was written at 10:00 local time on 2026-11-04.
const statusAt = new Date(2026, 10, 4, 10).getTime();
const pad = (n: number) => String(n).padStart(2, '0');

void test('the status gives the watts now, and nothing when stale or malformed', () => {
  assert.equal(parsePowerStatus(status, statusAt + 1000), 150);
  assert.equal(parsePowerStatus(status, statusAt + 60_000), null);
  assert.equal(parsePowerStatus('{', statusAt), null);
  assert.equal(parsePowerStatus('{"ts":1}', statusAt), null);
});

void test("today's kWh counts from local midnight, skips gaps and bad rows", () => {
  // 30 s at 100 W after midnight, two minutes at 200 W, one minute at 300 W after a gap: 45 000 J = 12.5 Wh.
  assert.equal(parseTodayKwh(samples, statusAt), 0.0125);
  assert.equal(parseTodayKwh('when,watts\n2026-11-04T09:00:00,1', statusAt), null);
  assert.equal(parseTodayKwh('iso,total_w\n', statusAt), 0);
});

void test('the hub reads a directory, and a missing one or no directory is null', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-powerstat-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(fixtures, dir, { recursive: true });
  writeFileSync(join(dir, 'status.json'), JSON.stringify({ ts: Date.now() / 1000, total_w: 210.5 }));
  const state = await createPowerLive(dir).read();
  assert.equal(state?.watts, 210.5);
  assert.equal(typeof state?.todayKwh, 'number');
  assert.equal(await createPowerLive(join(dir, 'missing')).read(), null);
  assert.equal(await createPowerLive(undefined).read(), null);
});

void test('an unreadable samples file keeps the watts and counts no kWh; a changed file is parsed again', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-powerstat-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'status.json'), JSON.stringify({ ts: Date.now() / 1000, total_w: 99 }));
  const live = createPowerLive(dir);
  assert.deepEqual(await live.read(), { watts: 99, todayKwh: 0 });
  const now = new Date();
  const at = (minutes: number) => {
    const time = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, minutes);
    return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}T${pad(time.getHours())}:${pad(minutes)}:00`;
  };
  writeFileSync(join(dir, 'samples.csv'), `iso,total_w\n${at(0)},60\n${at(1)},60\n`);
  assert.deepEqual(await live.read(), { watts: 99, todayKwh: 0.001 });
  writeFileSync(join(dir, 'samples.csv'), `iso,total_w\n${at(0)},60\n${at(1)},60\n${at(2)},120\n`);
  utimesSync(join(dir, 'samples.csv'), now, new Date(Date.now() + 5000));
  assert.deepEqual(await live.read(), { watts: 99, todayKwh: 0.003 });
});
