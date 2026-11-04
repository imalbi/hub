import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeDesktop } from './testing/fake-desktop.ts';
import type { Run, RunResult } from './core/exec.ts';
import { runSmoke } from './smoke.ts';

const ok = (stdout: string): RunResult => ({ stdout, stderr: '', code: 0 });
const statuses = (results: Awaited<ReturnType<typeof runSmoke>>) => results.map((r) => [r.name, r.status]);

/** The fake desktop plus the help and version answers it does not give. */
function healthy(override: (bin: string, args: string[]) => RunResult | undefined = () => undefined): Run {
  const desktop = createFakeDesktop();
  return (bin, args) => {
    const forced = override(bin, args);
    if (forced) return Promise.resolve(forced);
    if (bin === 'wpctl' && args[0] === '--help') return Promise.resolve(ok('Commands:\n  status\n  set-default ID\n'));
    if (bin === 'notify-send' && args[0] === '--help')
      return Promise.resolve(ok('Usage: notify-send --app-name=APP_NAME SUMMARY BODY'));
    if (args[0] === '--version') return Promise.resolve(ok(`${bin} 1.0\n`));
    return desktop(bin, args);
  };
}

void test('every check is ok on a healthy desktop', async () => {
  const results = await runSmoke(healthy());
  assert.deepEqual(statuses(results), [
    ['wpctl --help', 'ok'],
    ['playerctl --version', 'ok'],
    ['pw-dump', 'ok'],
    ['playerctl metadata', 'ok'],
    ['notify-send --help', 'ok'],
    ['pw-play --version', 'ok'],
  ]);
});

void test('only read-only commands are run', async () => {
  const seen: string[] = [];
  await runSmoke(
    healthy((bin, args) => {
      seen.push([bin, ...args].join(' '));
      return undefined;
    }),
  );
  assert.deepEqual(seen.map((line) => line.split(' ').slice(0, 2).join(' ')).toSorted(), [
    'notify-send --help',
    'playerctl --version',
    'playerctl metadata',
    'pw-dump',
    'pw-play --version',
    'wpctl --help',
  ]);
});

void test('a missing binary is reported as missing, not as unparseable', async () => {
  const results = await runSmoke(
    healthy((bin) => (bin === 'playerctl' ? { stdout: '', stderr: '', code: -1 } : undefined)),
  );
  assert.deepEqual(statuses(results), [
    ['wpctl --help', 'ok'],
    ['playerctl --version', 'missing'],
    ['pw-dump', 'ok'],
    ['playerctl metadata', 'missing'],
    ['notify-send --help', 'ok'],
    ['pw-play --version', 'ok'],
  ]);
});

void test('no player running is a normal state, not a failure', async () => {
  const noPlayer = { stdout: '', stderr: 'No players found\n', code: 1 };
  const results = await runSmoke(healthy((bin, args) => (args[0] === 'metadata' ? noPlayer : undefined)));
  assert.equal(results.find((r) => r.name === 'playerctl metadata')?.status, 'ok');
});

void test('pw-dump output the parser no longer understands is reported as unparseable', async () => {
  for (const stdout of ['not json', '[]', '[{"type":"PipeWire:Interface:Metadata","metadata":[]}]']) {
    const results = await runSmoke(healthy((bin) => (bin === 'pw-dump' ? ok(stdout) : undefined)));
    assert.equal(results.find((r) => r.name === 'pw-dump')?.status, 'unparseable', stdout);
  }
});

void test('a wpctl without set-default is reported as unparseable', async () => {
  const results = await runSmoke(
    healthy((bin, args) => (bin === 'wpctl' && args[0] === '--help' ? ok('Commands:\n  status\n') : undefined)),
  );
  assert.equal(results.find((r) => r.name === 'wpctl --help')?.status, 'unparseable');
});

void test('a playerctl status the parser does not know is reported as unparseable', async () => {
  const results = await runSmoke(
    healthy((bin, args) => (args[0] === 'metadata' ? ok('Buffering\tA\tT\n') : undefined)),
  );
  assert.equal(results.find((r) => r.name === 'playerctl metadata')?.status, 'unparseable');
});
