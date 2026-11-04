import { readFileSync } from 'node:fs';
import type { Run, RunResult } from '../core/exec.ts';
import { parsePwDump } from '../modules/audio/pipewire.ts';

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
}: { notifications?: string[][]; sounds?: string[]; system?: string[][] } = {}): Run {
  let sinkName = defaultName ?? '';
  let status = 'Playing';
  let track = 0;
  const titles = ['Title', 'Second Title', 'Third Title'];
  const artUrl = new URL('../modules/media/fixtures/cover.png', import.meta.url).href;

  return (bin, args) => {
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
        'systemctl suspend',
        'systemctl reboot',
        'systemctl poweroff',
      ].includes(systemCommand)
    ) {
      system.push([bin, ...args]);
      return Promise.resolve(ok());
    }
    if (bin === 'pw-dump' && args.length === 0) {
      return Promise.resolve(ok(dump.replace(/("default\.audio\.sink"[^}]*"name"\s*:\s*")[^"]+/, `$1${sinkName}`)));
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
