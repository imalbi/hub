import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyConfig, type Config } from '../../core/config.ts';
import type { Run } from '../../core/exec.ts';
import { buildServer } from '../../server.ts';

process.env.NODE_ENV = 'test';

function fakeRun(options: { statusCode?: number; startCode?: number; stopCode?: number } = {}) {
  const calls: Array<[string, string[]]> = [];
  let isRunning = options.statusCode === 0;
  const run: Run = (bin, args) => {
    calls.push([bin, args]);
    if (bin === 'fake-airplay') {
      const [action] = args;
      if (action === 'status') {
        const code = options.statusCode !== undefined ? options.statusCode : isRunning ? 0 : 1;
        return Promise.resolve({ stdout: code === 0 ? 'RUNNING' : 'STOPPED', stderr: '', code });
      }
      if (action === 'start') {
        const code = options.startCode ?? 0;
        if (code === 0) isRunning = true;
        return Promise.resolve({ stdout: '', stderr: '', code });
      }
      if (action === 'stop') {
        const code = options.stopCode ?? 0;
        if (code === 0) isRunning = false;
        return Promise.resolve({ stdout: '', stderr: '', code });
      }
    }
    return Promise.resolve({ stdout: '', stderr: '', code: 0 });
  };
  return { run, calls };
}

const configured: Config = {
  ...emptyConfig,
  airplay: { command: 'fake-airplay' },
};

void test('airplay is off without config: state is null and mutations fail', async () => {
  const { run, calls } = fakeRun();
  const app = buildServer({ dbPath: ':memory:', deps: { run }, config: emptyConfig });

  const stateRes = await app.inject({ method: 'GET', url: '/trpc/airplay.state' });
  assert.equal(stateRes.statusCode, 200);
  assert.equal(stateRes.json().result.data, null);

  const startRes = await app.inject({
    method: 'POST',
    url: '/trpc/airplay.start',
    headers: { 'content-type': 'application/json' },
    payload: '{}',
  });
  assert.equal(startRes.statusCode, 412);

  const stopRes = await app.inject({
    method: 'POST',
    url: '/trpc/airplay.stop',
    headers: { 'content-type': 'application/json' },
    payload: '{}',
  });
  assert.equal(stopRes.statusCode, 412);

  assert.equal(calls.length, 0);
});

void test('airplay.state reports running status from exit code of airplay status', async () => {
  const stopped = fakeRun({ statusCode: 1 });
  const appStopped = buildServer({ dbPath: ':memory:', deps: { run: stopped.run }, config: configured });
  const resStopped = await appStopped.inject({ method: 'GET', url: '/trpc/airplay.state' });
  assert.deepEqual(resStopped.json().result.data, { running: false });
  assert.deepEqual(stopped.calls.at(-1), ['fake-airplay', ['status']]);

  const running = fakeRun({ statusCode: 0 });
  const appRunning = buildServer({ dbPath: ':memory:', deps: { run: running.run }, config: configured });
  const resRunning = await appRunning.inject({ method: 'GET', url: '/trpc/airplay.state' });
  assert.deepEqual(resRunning.json().result.data, { running: true });
  assert.deepEqual(running.calls.at(-1), ['fake-airplay', ['status']]);
});

void test('airplay.start and airplay.stop invoke the command and handle errors', async () => {
  const { run, calls } = fakeRun();
  const app = buildServer({ dbPath: ':memory:', deps: { run }, config: configured });

  const startRes = await app.inject({
    method: 'POST',
    url: '/trpc/airplay.start',
    headers: { 'content-type': 'application/json' },
    payload: '{}',
  });
  assert.equal(startRes.statusCode, 200);
  assert.deepEqual(calls.at(-1), ['fake-airplay', ['start']]);

  const stopRes = await app.inject({
    method: 'POST',
    url: '/trpc/airplay.stop',
    headers: { 'content-type': 'application/json' },
    payload: '{}',
  });
  assert.equal(stopRes.statusCode, 200);
  assert.deepEqual(calls.at(-1), ['fake-airplay', ['stop']]);

  const failing = fakeRun({ startCode: 1, stopCode: 1 });
  const failingApp = buildServer({ dbPath: ':memory:', deps: { run: failing.run }, config: configured });
  assert.equal(
    (
      await failingApp.inject({
        method: 'POST',
        url: '/trpc/airplay.start',
        headers: { 'content-type': 'application/json' },
        payload: '{}',
      })
    ).statusCode,
    500,
  );
  assert.equal(
    (
      await failingApp.inject({
        method: 'POST',
        url: '/trpc/airplay.stop',
        headers: { 'content-type': 'application/json' },
        payload: '{}',
      })
    ).statusCode,
    500,
  );
});
