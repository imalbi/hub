import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeDesktop } from './fake-desktop.ts';
import { parsePwDump } from '../modules/audio/pipewire.ts';
import { MEDIA_FORMAT, parseMediaState } from '../modules/media/playerctl.ts';

const defaultSink = async (run = createFakeDesktop()) => parsePwDump((await run('pw-dump', [])).stdout).defaultName;
const mediaStatus = async (run = createFakeDesktop()) =>
  parseMediaState(await run('playerctl', ['metadata', '--format', MEDIA_FORMAT]))?.status;

void test('wpctl set-default moves the default sink that pw-dump reports', async () => {
  const run = createFakeDesktop();
  assert.equal(await defaultSink(run), 'alsa_output.usb-headset.analog-stereo');
  assert.equal((await run('wpctl', ['set-default', '51'])).code, 0);
  assert.equal(await defaultSink(run), 'alsa_output.hdmi-monitor.hdmi-stereo');
});

void test('playerctl play-pause flips the status that metadata reports', async () => {
  const run = createFakeDesktop();
  assert.equal(await mediaStatus(run), 'Playing');
  assert.equal((await run('playerctl', ['play-pause'])).code, 0);
  assert.equal(await mediaStatus(run), 'Paused');
  await run('playerctl', ['play-pause']);
  assert.equal(await mediaStatus(run), 'Playing');
});

void test('every other command is refused and changes nothing', async () => {
  const run = createFakeDesktop();
  const refused = [
    ['rm', ['-rf', '/']],
    ['wpctl', ['set-default', '999']],
    ['wpctl', ['set-volume', '@DEFAULT_SINK@', '0']],
    ['playerctl', ['shuffle']],
    ['pw-dump', ['--unknown']],
    ['systemctl', ['poweroff', '--force']],
    ['systemctl', ['halt']],
    ['caelestia', ['toggle', 'unknown']],
    ['webdigest', []],
    ['xdg-open', ['https://example.com']],
  ] as const;
  for (const [bin, args] of refused) {
    const { code } = await run(bin, [...args]);
    assert.notEqual(code, 0, `${bin} ${args.join(' ')} must be refused`);
  }
  assert.equal(await defaultSink(run), 'alsa_output.usb-headset.analog-stereo');
  assert.equal(await mediaStatus(run), 'Playing');
});

void test('two fake desktops do not share state', async () => {
  const a = createFakeDesktop();
  await a('playerctl', ['play-pause']);
  assert.equal(await mediaStatus(), 'Playing');
});

void test('next/previous move the fake track and preserve play status and fixture artwork', async () => {
  const run = createFakeDesktop();
  await run('playerctl', ['play-pause']);
  await run('playerctl', ['next']);
  const next = await run('playerctl', ['metadata', '--format', MEDIA_FORMAT]);
  assert.equal(parseMediaState(next)?.title, 'Second Title');
  assert.equal(parseMediaState(next)?.status, 'Paused');
  assert.match(parseMediaState(next)?.artKey ?? '', /^[a-f0-9]{16}$/);
  await run('playerctl', ['previous']);
  assert.equal(parseMediaState(await run('playerctl', ['metadata', '--format', MEDIA_FORMAT]))?.title, 'Title');
});

void test('Hub notifications are accepted and recorded without invoking a binary', async () => {
  const notifications: string[][] = [];
  const run = createFakeDesktop({ notifications });
  const args = ['--app-name', 'Hub', 'Pausa terminata', 'Puoi iniziare una nuova sessione.'];
  assert.equal((await run('notify-send', args)).code, 0);
  assert.deepEqual(notifications, [args]);
  assert.notEqual((await run('notify-send', ['--wait', 'unrecognized'])).code, 0);
});

void test('caelestia toggle hub is accepted and recorded in system array', async () => {
  const system: string[][] = [];
  const run = createFakeDesktop({ system });
  assert.equal((await run('caelestia', ['toggle', 'hub'])).code, 0);
  assert.deepEqual(system, [['caelestia', 'toggle', 'hub']]);
});

void test('wpctl get-volume, set-volume and set-mute manage fake audio state', async () => {
  const run = createFakeDesktop();
  assert.equal((await run('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@'])).stdout.trim(), 'Volume: 0.80');
  assert.equal((await run('wpctl', ['get-volume', '@DEFAULT_AUDIO_SOURCE@'])).stdout.trim(), 'Volume: 1.00');

  assert.equal((await run('wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', '0.50'])).code, 0);
  assert.equal((await run('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@'])).stdout.trim(), 'Volume: 0.50');

  assert.equal((await run('wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', 'toggle'])).code, 0);
  assert.equal((await run('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@'])).stdout.trim(), 'Volume: 0.50 [MUTED]');

  assert.equal((await run('wpctl', ['set-mute', '@DEFAULT_AUDIO_SOURCE@', 'toggle'])).code, 0);
  assert.equal((await run('wpctl', ['get-volume', '@DEFAULT_AUDIO_SOURCE@'])).stdout.trim(), 'Volume: 1.00 [MUTED]');
});

void test('airplay status, start and stop manage fake AirPlay state', async () => {
  const run = createFakeDesktop();
  assert.equal((await run('airplay', ['status'])).code, 1);
  assert.equal((await run('airplay', ['start'])).code, 0);
  assert.equal((await run('airplay', ['status'])).code, 0);
  assert.equal((await run('airplay', ['stop'])).code, 0);
  assert.equal((await run('airplay', ['status'])).code, 1);
});

void test('himalaya answers only the argv Hub builds: a send, a read with --seen, an unknown account or flag are refused', async () => {
  const calls: string[][] = [];
  const run = createFakeDesktop({ mail: calls });
  const himalaya = (args: string[]) => run('himalaya', args);
  const refusals = [
    ['--json', '-a', 'work', 'message', 'send'],
    ['--json', '-a', 'work', 'message', 'read', '-m', 'INBOX', '310', '--seen'],
    ['--json', '-a', 'nosuch', 'envelope', 'list', '-m', 'INBOX', '-p', '1', '-s', '25'],
    ['--json', '-a', 'work', 'flag', 'add', '-m', 'INBOX', '-f', 'deleted', '310'],
    ['--json', '-a', 'work', 'flag', 'add', '-m', 'INBOX', '-f', 'seen', '999'],
  ];
  for (const args of refusals) assert.equal((await himalaya(args)).code, 127, args.join(' '));
  assert.equal(calls.length, refusals.length, 'refused calls are still recorded');
});

/** The flags himalaya reports for message 310 on one desktop. */
const flagsOf = async (desktop: ReturnType<typeof createFakeDesktop>) =>
  JSON.parse(
    (await desktop('himalaya', ['--json', '-a', 'work', 'envelope', 'list', '-m', 'INBOX'])).stdout,
  ).envelopes.find((row: { id: string }) => row.id === '310').flags;

void test('a flag change is kept by the desktop that made it and not by another one', async () => {
  const run = createFakeDesktop();
  const other = createFakeDesktop();
  assert.deepEqual(await flagsOf(run), []);
  assert.equal(
    (await run('himalaya', ['--json', '-a', 'work', 'flag', 'add', '-m', 'INBOX', '-f', 'seen', '310'])).code,
    0,
  );
  assert.deepEqual(await flagsOf(run), [{ raw: '\\Seen', iana: 'seen' }]);
  assert.deepEqual(await flagsOf(other), []);
});
