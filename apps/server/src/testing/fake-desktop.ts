import { readFileSync } from 'node:fs';
import type { Run, RunResult } from '../core/exec.ts';
import { parsePwDump } from '../modules/audio/pipewire.ts';
import { createFakeHimalaya } from './fake-himalaya.ts';

const dump = readFileSync(new URL('../modules/audio/fixtures/pw-dump.json', import.meta.url), 'utf8');
const { sinks, defaultName } = parsePwDump(dump);

const ok = (stdout = ''): RunResult => ({ stdout, stderr: '', code: 0 });
const refused: RunResult = { stdout: '', stderr: 'fake desktop: command not supported', code: 127 };

/**
 * A desktop in memory for tests and the e2e server: the `pw-dump` fixture with a movable default sink and one
 * track whose status flips on play-pause. Only the commands Hub's actions use are answered; everything else is
 * refused, so nothing here can reach a real binary.
 */
export function createFakeDesktop({
  notifications = [],
  sounds = [],
  system = [],
  news = [],
  mail = [],
}: {
  notifications?: string[][];
  sounds?: string[];
  system?: string[][];
  news?: string[][];
  /** Every `himalaya` argv the fake was asked, refused ones included. */
  mail?: string[][];
} = {}): Run {
  const himalaya = createFakeHimalaya();
  let sinkName = defaultName ?? '';
  let status = 'Playing';
  let track = 0;
  let sinkVolume = 0.8;
  let sinkMuted = false;
  let micMuted = false;
  let airplayRunning = false;
  const titles = ['Title', 'Second Title', 'Third Title'];
  const artUrl = new URL('../modules/media/fixtures/cover.png', import.meta.url).href;

  return (bin, args) => {
    if (bin === 'himalaya') {
      mail.push([...args]);
      return Promise.resolve(himalaya(args));
    }
    const [command, target] = args;
    if (bin === 'notify-send' && args.length === 4 && command === '--app-name' && target === 'Hub') {
      notifications.push([...args]);
      return Promise.resolve(ok());
    }
    if (bin === 'pw-play' && args.length === 1 && command?.endsWith('.wav')) {
      sounds.push(command);
      return Promise.resolve(ok());
    }
    // Lock, power and workspace toggles: recorded, never run. The power actions are only ever tried by the owner by hand.
    const systemCommand = [bin, ...args].join(' ');
    if (
      [
        'caelestia shell lock lock',
        'caelestia toggle communication',
        'caelestia toggle music',
        'caelestia toggle hub',
        'systemctl suspend',
        'systemctl reboot',
        'systemctl poweroff',
      ].includes(systemCommand)
    ) {
      system.push([bin, ...args]);
      return Promise.resolve(ok());
    }
    if (bin === 'airplay') {
      if (command === 'status') {
        return Promise.resolve(
          airplayRunning
            ? ok('AirPlay (UxPlay) is RUNNING [PID 12345]\n')
            : { stdout: 'AirPlay (UxPlay) is STOPPED\n', stderr: '', code: 1 },
        );
      }
      if (command === 'start') {
        airplayRunning = true;
        return Promise.resolve(ok('AirPlay started\n'));
      }
      if (command === 'stop') {
        airplayRunning = false;
        return Promise.resolve(ok('AirPlay stopped\n'));
      }
    }
    // The digest as the fake config names it, and opening its page: recorded, never run (a real run marks news seen).
    if (
      (bin === 'webdigest' && systemCommand === 'webdigest --no-open') ||
      (bin === 'xdg-open' && args.length === 1 && command?.endsWith('.html'))
    ) {
      news.push([bin, ...args]);
      return Promise.resolve(ok());
    }
    if (bin === 'pw-dump' && args.length === 0) {
      return Promise.resolve(ok(dump.replace(/("default\.audio\.sink"[^}]*"name"\s*:\s*")[^"]+/, `$1${sinkName}`)));
    }
    if (bin === 'wpctl' && command === 'get-volume') {
      if (target === '@DEFAULT_AUDIO_SINK@') {
        return Promise.resolve(ok(`Volume: ${sinkVolume.toFixed(2)}${sinkMuted ? ' [MUTED]' : ''}\n`));
      }
      if (target === '@DEFAULT_AUDIO_SOURCE@') {
        return Promise.resolve(ok(`Volume: 1.00${micMuted ? ' [MUTED]' : ''}\n`));
      }
    }
    if (bin === 'wpctl' && command === 'set-volume' && target === '@DEFAULT_AUDIO_SINK@' && args[2]) {
      const val = Number.parseFloat(args[2]);
      if (!Number.isNaN(val)) {
        sinkVolume = Math.max(0, Math.min(1, val));
        return Promise.resolve(ok());
      }
    }
    if (bin === 'wpctl' && command === 'set-mute') {
      const mode = args[2];
      if (target === '@DEFAULT_AUDIO_SINK@') {
        if (mode === 'toggle') sinkMuted = !sinkMuted;
        else if (mode === '1') sinkMuted = true;
        else if (mode === '0') sinkMuted = false;
        else return Promise.resolve(refused);
        return Promise.resolve(ok());
      }
      if (target === '@DEFAULT_AUDIO_SOURCE@') {
        if (mode === 'toggle') micMuted = !micMuted;
        else if (mode === '1') micMuted = true;
        else if (mode === '0') micMuted = false;
        else return Promise.resolve(refused);
        return Promise.resolve(ok());
      }
    }
    if (bin === 'wpctl' && command === 'set-default') {
      const sink = sinks.find((s) => String(s.id) === target);
      if (!sink) return Promise.resolve(refused);
      sinkName = sink.name;
      return Promise.resolve(ok());
    }
    if (bin === 'playerctl' && command === 'metadata')
      return Promise.resolve(ok(`${status}\tArtist\t${titles[track]}\t${artUrl}\t213000000\n`));
    if (bin === 'playerctl' && args.length === 1 && (command === 'next' || command === 'previous')) {
      track = (track + (command === 'next' ? 1 : titles.length - 1)) % titles.length;
      return Promise.resolve(ok());
    }
    if (bin === 'playerctl' && command === 'play-pause') {
      status = status === 'Playing' ? 'Paused' : 'Playing';
      return Promise.resolve(ok());
    }
    return Promise.resolve(refused);
  };
}
