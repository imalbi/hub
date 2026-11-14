import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createFakeDesktop } from './testing/fake-desktop.ts';
import type { Run, RunResult } from './core/exec.ts';
import { runSmoke } from './smoke.ts';

const ok = (stdout: string): RunResult => ({ stdout, stderr: '', code: 0 });
const statuses = (results: Awaited<ReturnType<typeof runSmoke>>) => results.map((r) => [r.name, r.status]);

void test('pdftotext version is checked from stderr and rejects unknown output', async () => {
  const version = await runSmoke(
    healthy((bin, args) =>
      bin === 'pdftotext' && args.join(' ') === '-v'
        ? { stdout: '', stderr: 'pdftotext version 26.10.0\n', code: 0 }
        : undefined,
    ),
  );
  assert.equal(version.find((result) => result.name === 'pdftotext -v')?.status, 'ok');
  const changed = await runSmoke(healthy((bin) => (bin === 'pdftotext' ? ok('unexpected output') : undefined)));
  assert.equal(changed.find((result) => result.name === 'pdftotext -v')?.status, 'unparseable');
});

/** The fake desktop plus the help and version answers it does not give. */
function healthy(override: (bin: string, args: string[]) => RunResult | undefined = () => undefined): Run {
  const desktop = createFakeDesktop();
  return (bin, args) => {
    const forced = override(bin, args);
    if (forced) return Promise.resolve(forced);
    if (bin === 'wpctl' && args[0] === '--help') return Promise.resolve(ok('Commands:\n  status\n  set-default ID\n'));
    if (bin === 'caelestia' && args.join(' ') === 'shell -s')
      return Promise.resolve(ok('target lock\n  function unlock(): void\n  function lock(): void\n'));
    if (bin === 'caelestia' && args.join(' ') === 'toggle --help')
      return Promise.resolve(ok('usage: caelestia toggle [-h] workspace\n'));
    if (bin === 'notify-send' && args[0] === '--help')
      return Promise.resolve(ok('Usage: notify-send --app-name=APP_NAME SUMMARY BODY'));
    if (bin === 'pdftotext' && args[0] === '-v')
      return Promise.resolve({ stdout: '', stderr: 'pdftotext version 26.10.0\n', code: 0 });
    if (args[0] === '--version') return Promise.resolve(ok(`${bin} 1.0\n`));
    return desktop(bin, args);
  };
}

void test('every check is ok on a healthy desktop', async () => {
  const results = await runSmoke(healthy());
  assert.deepEqual(statuses(results), [
    ['wpctl --help', 'ok'],
    ['wpctl get-volume', 'ok'],
    ['playerctl --version', 'ok'],
    ['pw-dump', 'ok'],
    ['playerctl metadata', 'ok'],
    ['playerctl --player=mpv status', 'ok'],
    ['notify-send --help', 'ok'],
    ['pw-play --version', 'ok'],
    ['pdftotext -v', 'ok'],
    ['systemctl --version', 'ok'],
    ['busctl --version', 'ok'],
    ['caelestia shell -s', 'ok'],
    ['hyprctl monitors all -j', 'ok'],
    ['caelestia toggle --help', 'ok'],
    ['himalaya --version', 'ok'],
    ['himalaya envelope schema', 'ok'],
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
    'busctl --version',
    'caelestia shell',
    'caelestia toggle',
    'himalaya --version',
    'himalaya json-schema',
    'hyprctl monitors',
    'notify-send --help',
    'pdftotext -v',
    'playerctl --player=mpv',
    'playerctl --version',
    'playerctl metadata',
    'pw-dump',
    'pw-play --version',
    'systemctl --version',
    'wpctl --help',
    'wpctl get-volume',
  ]);
});

void test('a missing binary is reported as missing, not as unparseable', async () => {
  const results = await runSmoke(
    healthy((bin) => (bin === 'playerctl' ? { stdout: '', stderr: '', code: -1 } : undefined)),
  );
  assert.deepEqual(statuses(results), [
    ['wpctl --help', 'ok'],
    ['wpctl get-volume', 'ok'],
    ['playerctl --version', 'missing'],
    ['pw-dump', 'ok'],
    ['playerctl metadata', 'missing'],
    ['playerctl --player=mpv status', 'missing'],
    ['notify-send --help', 'ok'],
    ['pw-play --version', 'ok'],
    ['pdftotext -v', 'ok'],
    ['systemctl --version', 'ok'],
    ['busctl --version', 'ok'],
    ['caelestia shell -s', 'ok'],
    ['hyprctl monitors all -j', 'ok'],
    ['caelestia toggle --help', 'ok'],
    ['himalaya --version', 'ok'],
    ['himalaya envelope schema', 'ok'],
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

void test('a wpctl get-volume output the parser does not know is reported as unparseable', async () => {
  const results = await runSmoke(
    healthy((bin, args) => (bin === 'wpctl' && args[0] === 'get-volume' ? ok('not a volume string') : undefined)),
  );
  assert.equal(results.find((r) => r.name === 'wpctl get-volume')?.status, 'unparseable');
});

void test('a playerctl status the parser does not know is reported as unparseable', async () => {
  const results = await runSmoke(
    healthy((bin, args) => (args[0] === 'metadata' ? ok('Buffering\tA\tT\n') : undefined)),
  );
  assert.equal(results.find((r) => r.name === 'playerctl metadata')?.status, 'unparseable');
});

void test('a configured powerstat dir is checked through the real parser', async () => {
  const dir = new URL('modules/system/fixtures/powerstat', import.meta.url).pathname;
  const results = await runSmoke(healthy(), { powerstatDir: dir });
  // The fixture status is old, so it reads as stale: the check sees the files but says so.
  assert.equal(results.find((r) => r.name === 'powerstat dir')?.status, 'unparseable');
  const missing = await runSmoke(healthy(), { powerstatDir: '/nonexistent/powerstat' });
  assert.equal(missing.find((r) => r.name === 'powerstat dir')?.status, 'missing');
});

void test('a configured digest runs only its self-check, and its page goes through the real parser', async () => {
  const seen: string[][] = [];
  const page = new URL('modules/news/fixtures/latest.html', import.meta.url).pathname;
  const results = await runSmoke(
    healthy((bin, args) => {
      if (bin !== 'webdigest') return undefined;
      seen.push(args);
      return ok('ok\n');
    }),
    { news: { page, command: 'webdigest' } },
  );
  assert.deepEqual(seen, [['--test']]);
  assert.equal(results.find((r) => r.name === 'news digest --test')?.status, 'ok');
  assert.equal(results.find((r) => r.name === 'news page')?.status, 'ok');
});

void test('a himalaya schema that no longer has a field Hub reads is reported as unparseable', async () => {
  const schema = JSON.parse(
    readFileSync(new URL('modules/mail/fixtures/envelope-list.schema.json', import.meta.url), 'utf8'),
  );
  delete schema.$defs.Envelope.properties['has-attachment'];
  const results = await runSmoke(
    healthy((bin, args) => (bin === 'himalaya' && args[0] === 'json-schema' ? ok(JSON.stringify(schema)) : undefined)),
  );
  const check = results.find((r) => r.name === 'himalaya envelope schema');
  assert.equal(check?.status, 'unparseable');
  assert.equal(check?.detail, 'missing has-attachment');
});

void test('mpv status accepts known states and rejects unknown output', async () => {
  for (const [status, expected] of [
    ['Playing', 'ok'],
    ['Paused', 'ok'],
    ['Stopped', 'ok'],
    ['Buffering', 'unparseable'],
  ] as const) {
    const results = await runSmoke(
      healthy((bin, args) => (bin === 'playerctl' && args[0] === '--player=mpv' ? ok(status + '\n') : undefined)),
    );
    assert.equal(results.find((r) => r.name === 'playerctl --player=mpv status')?.status, expected);
  }
});

const monitorCheck = (results: Awaited<ReturnType<typeof runSmoke>>) =>
  results.find((result) => result.name === 'hyprctl monitors all -j')?.status;

void test('the monitor list check fails on a reshaped answer and a failing hyprctl', async () => {
  assert.equal(
    monitorCheck(await runSmoke(healthy((bin) => (bin === 'hyprctl' ? ok('{"monitors":[]}') : undefined)))),
    'unparseable',
  );
  assert.equal(
    monitorCheck(
      await runSmoke(healthy((bin) => (bin === 'hyprctl' ? { stdout: '', stderr: 'no', code: 1 } : undefined))),
    ),
    'unparseable',
  );
});
