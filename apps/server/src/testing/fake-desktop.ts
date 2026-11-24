import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Run, RunResult, StreamSpawn } from '../core/exec.ts';
import { parsePwDump } from '../modules/audio/pipewire.ts';

const dump = readFileSync(new URL('../modules/audio/fixtures/pw-dump.json', import.meta.url), 'utf8');
const { sinks, defaultName } = parsePwDump(dump);
const monitorFixture = readFileSync(new URL('../modules/system/fixtures/monitors.json', import.meta.url), 'utf8');
/** The fixture's monitors by output name, true when disabled: the default state of the fake's `monitors` option. */
export const fakeMonitors = (): Record<string, boolean> =>
  Object.fromEntries(parseMonitorFixture().map(({ name, disabled }) => [name, disabled]));
function parseMonitorFixture(): { name: string; disabled: boolean }[] {
  return z.array(z.object({ name: z.string(), disabled: z.boolean() }).loose()).parse(JSON.parse(monitorFixture));
}

const ok = (stdout = ''): RunResult => ({ stdout, stderr: '', code: 0 });
const refused: RunResult = { stdout: '', stderr: 'fake desktop: command not supported', code: 127 };

export const fakeStreamSpawn: StreamSpawn = (bin, _args, line, end) => {
  if (bin !== 'fake-job') {
    queueMicrotask(() => end(127));
    return { kill() {} };
  }
  let count = 0;
  const timer = setInterval(() => line(`Riga ${++count}`, 'stdout'), 250);
  return {
    kill: () => {
      clearInterval(timer);
      end(null);
    },
  };
};

/**
 * A desktop in memory for tests and the e2e server: the `pw-dump` fixture with a movable default sink and one
 * track whose status flips on play-pause. Only the commands Hub's actions use are answered; everything else is
 * refused, so nothing here can reach a real binary.
 */
export function createFakeDesktop({
  notifications = [],
  sounds = [],
  system = [],
  player = { gone: false },
  monitors = fakeMonitors(),
}: {
  notifications?: string[][];
  sounds?: string[];
  system?: string[][];
  /** Set `gone` to make every playerctl read answer "No players found" (the e2e hook `/__fake/player`). */
  player?: { gone: boolean };
  /** Disabled flag per output name, answered as `hyprctl monitors all -j` and flipped by `fake-monitor-<output>` (the e2e hook `/__fake/monitor` sets it too). */
  monitors?: Record<string, boolean>;
} = {}): Run {
  let sinkName = defaultName ?? '';
  let status = 'Playing';
  let track = 0;
  let position = 12;
  let sinkVolume = 0.8;
  let sinkMuted = false;
  let micMuted = false;
  const titles = ['Title', 'Second Title', 'Third Title'];
  const artUrl = new URL('../modules/media/fixtures/cover.png', import.meta.url).href;

  return (bin, args) => {
    const [command, target] = args;
    if (
      bin === 'notify-send' &&
      args.length === 5 &&
      command === '--app-name' &&
      target === 'Hub' &&
      args[2] === '--'
    ) {
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
    if (bin === 'hyprctl' && systemCommand === 'hyprctl monitors all -j') {
      const listed = parseMonitorFixture().map((monitor) => ({ ...monitor, disabled: monitors[monitor.name] ?? true }));
      return Promise.resolve(ok(JSON.stringify(listed)));
    }
    // The owner's toggle script, by name: it flips the monitor it is named after and is recorded like the other commands.
    const toggled =
      bin.startsWith('fake-monitor-') && args.length === 0 ? bin.slice('fake-monitor-'.length) : undefined;
    if (toggled !== undefined && toggled in monitors) {
      monitors[toggled] = !monitors[toggled];
      system.push([bin]);
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
    if (bin === 'playerctl' && command === '--player=mpv' && target === 'status')
      return Promise.resolve({ stdout: '', stderr: 'No players found', code: 1 });
    if (bin === 'playerctl' && player.gone && (command === 'metadata' || command === 'position'))
      return Promise.resolve({ stdout: '', stderr: 'No players found', code: 1 });
    if (bin === 'playerctl' && command === 'metadata')
      return Promise.resolve(ok(`${status}\tArtist\t${titles[track]}\t${artUrl}\t213000000\n`));
    if (bin === 'playerctl' && command === 'position') {
      if (target !== undefined && Number.isFinite(Number(target)) && Number(target) >= 0) position = Number(target);
      return Promise.resolve(ok(`${position}\n`));
    }
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
