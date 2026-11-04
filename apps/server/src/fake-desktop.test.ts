import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeDesktop } from './fake-desktop.ts';
import { parsePwDump } from './modules/audio/pipewire.ts';
import { MEDIA_FORMAT, parseMediaState } from './modules/media/playerctl.ts';

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
    ['playerctl', ['next']],
    ['pw-dump', ['--unknown']],
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
