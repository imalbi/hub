import { run as realRun, type Run, type RunResult } from './core/exec.ts';
import { parsePwDump, parseVolume } from './modules/audio/pipewire.ts';
import { loadConfig } from './core/config.ts';
import { MEDIA_FORMAT, parseMediaState } from './modules/media/playerctl.ts';
import { parseMonitorList } from './modules/system/monitor.ts';
import { createPowerLive } from './modules/system/power.ts';
import { ENVELOPE_SCHEMA_ARGS, missingEnvelopeFields } from './modules/mail/himalaya.ts';

export type SmokeResult = { name: string; status: 'ok' | 'missing' | 'unparseable'; detail: string };
type Verdict = Pick<SmokeResult, 'status' | 'detail'>;

// `run` reports a missing binary, and also a timeout, as -1.
const NOT_RUN = -1;

const exitDetail = ({ code, stderr }: RunResult) => `exit ${code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`;

const judgeVersion = (result: RunResult): Verdict =>
  result.code === 0
    ? { status: 'ok', detail: result.stdout.trim().split('\n')[0] ?? '' }
    : { status: 'unparseable', detail: exitDetail(result) };

function judgePdftotext(result: RunResult): Verdict {
  const version = `${result.stderr}\n${result.stdout}`.match(/^pdftotext version \d+(?:\.\d+)+/m)?.[0];
  return result.code === 0 && version
    ? { status: 'ok', detail: version }
    : { status: 'unparseable', detail: result.code === 0 ? 'unknown version format' : exitDetail(result) };
}

// wpctl has no --version. Its help is a cheap, read-only proof that the one subcommand Hub mutates with is still there.
function judgeWpctlHelp(result: RunResult): Verdict {
  if (result.code !== 0) return { status: 'unparseable', detail: exitDetail(result) };
  return result.stdout.includes('set-default')
    ? { status: 'ok', detail: 'set-default listed' }
    : { status: 'unparseable', detail: 'set-default not listed in the help' };
}

function judgeGetVolume(result: RunResult): Verdict {
  if (result.code !== 0) return { status: 'unparseable', detail: exitDetail(result) };
  const volume = parseVolume(result.stdout);
  if (!volume) return { status: 'unparseable', detail: 'unknown volume format' };
  return { status: 'ok', detail: `volume ${Math.round(volume.volume * 100)}%${volume.muted ? ' (muted)' : ''}` };
}

function judgeNotifyHelp(result: RunResult): Verdict {
  return result.code === 0 && result.stdout.includes('--app-name')
    ? { status: 'ok', detail: 'app-name option listed' }
    : { status: 'unparseable', detail: result.code === 0 ? 'app-name not listed in the help' : exitDetail(result) };
}

function judgeLockTarget(result: RunResult): Verdict {
  return result.code === 0 && /target lock\n(\s+function .*\n)*\s+function lock\(\)/.test(result.stdout)
    ? { status: 'ok', detail: 'lock IPC target listed' }
    : { status: 'unparseable', detail: result.code === 0 ? 'no lock() in the lock target' : exitDetail(result) };
}

// The envelope fields Hub reads must still be in himalaya's own schema. Reads the schema only: no account is touched.
function judgeEnvelopeSchema(result: RunResult): Verdict {
  if (result.code !== 0) return { status: 'unparseable', detail: exitDetail(result) };
  const missing = missingEnvelopeFields(result.stdout);
  if (missing === null) return { status: 'unparseable', detail: 'no Envelope definition in the schema' };
  return missing.length === 0
    ? { status: 'ok', detail: 'envelope fields match' }
    : { status: 'unparseable', detail: `missing ${missing.join(', ')}` };
}

function judgeToggleHelp(result: RunResult): Verdict {
  return result.code === 0 && result.stdout.includes('workspace')
    ? { status: 'ok', detail: 'toggle takes a workspace' }
    : { status: 'unparseable', detail: result.code === 0 ? 'workspace argument not listed' : exitDetail(result) };
}

// Reads the monitor list, off ones included, the way the Monitor rows do. Never the toggle: that needs the owner's script.
function judgeMonitors(result: RunResult): Verdict {
  if (result.code !== 0) return { status: 'unparseable', detail: exitDetail(result) };
  const listed = parseMonitorList(result.stdout);
  return listed
    ? { status: 'ok', detail: `${listed.length} monitors listed` }
    : { status: 'unparseable', detail: 'unknown monitors format' };
}

function judgePwDump(result: RunResult): Verdict {
  if (result.code !== 0) return { status: 'unparseable', detail: exitDetail(result) };
  const { sinks, defaultName } = parsePwDump(result.stdout);
  if (sinks.length === 0) return { status: 'unparseable', detail: 'no Audio/Sink node found' };
  if (defaultName === null) return { status: 'unparseable', detail: 'no default.audio.sink in the metadata' };
  return { status: 'ok', detail: `${sinks.length} sinks, default sink found` };
}

function judgeMetadata(result: RunResult): Verdict {
  // No player running is a normal state for Hub (the media tile shows "nothing playing").
  if (result.code !== 0 && /no players found/i.test(result.stderr))
    return { status: 'ok', detail: 'no player running' };
  const state = parseMediaState(result);
  if (state) return { status: 'ok', detail: `status ${state.status}` };
  return { status: 'unparseable', detail: result.code === 0 ? 'unknown status or format' : exitDetail(result) };
}

function judgeMpvStatus(result: RunResult): Verdict {
  if (result.code !== 0 && /no players found/i.test(result.stderr)) return { status: 'ok', detail: 'mpv not running' };
  const status = result.stdout.trim();
  return result.code === 0 && ['Playing', 'Paused', 'Stopped'].includes(status)
    ? { status: 'ok', detail: `status ${status}` }
    : { status: 'unparseable', detail: result.code === 0 ? 'unknown status' : exitDetail(result) };
}

// Read-only on purpose: no `set-default`, no `play-pause`. This runs against the real desktop.
const checks = [
  { name: 'wpctl --help', bin: 'wpctl', args: ['--help'], judge: judgeWpctlHelp },
  { name: 'wpctl get-volume', bin: 'wpctl', args: ['get-volume', '@DEFAULT_AUDIO_SINK@'], judge: judgeGetVolume },
  { name: 'playerctl --version', bin: 'playerctl', args: ['--version'], judge: judgeVersion },
  { name: 'pw-dump', bin: 'pw-dump', args: [], judge: judgePwDump },
  { name: 'playerctl metadata', bin: 'playerctl', args: ['metadata', '--format', MEDIA_FORMAT], judge: judgeMetadata },
  { name: 'playerctl --player=mpv status', bin: 'playerctl', args: ['--player=mpv', 'status'], judge: judgeMpvStatus },
  { name: 'notify-send --help', bin: 'notify-send', args: ['--help'], judge: judgeNotifyHelp },
  { name: 'pw-play --version', bin: 'pw-play', args: ['--version'], judge: judgeVersion },
  { name: 'pdftotext -v', bin: 'pdftotext', args: ['-v'], judge: judgePdftotext },
  { name: 'systemctl --version', bin: 'systemctl', args: ['--version'], judge: judgeVersion },
  // The Hue light is driven through BlueZ with busctl; this only proves the binary is there.
  { name: 'busctl --version', bin: 'busctl', args: ['--version'], judge: judgeVersion },
  // Lists the shell's IPC targets without calling one: the lock action needs `lock lock`.
  { name: 'caelestia shell -s', bin: 'caelestia', args: ['shell', '-s'], judge: judgeLockTarget },
  { name: 'hyprctl monitors all -j', bin: 'hyprctl', args: ['monitors', 'all', '-j'], judge: judgeMonitors },
  { name: 'caelestia toggle --help', bin: 'caelestia', args: ['toggle', '--help'], judge: judgeToggleHelp },
  // Mail: the binary, and the listing fields Hub reads against himalaya's schema. Never an account command.
  { name: 'himalaya --version', bin: 'himalaya', args: ['--version'], judge: judgeVersion },
  { name: 'himalaya envelope schema', bin: 'himalaya', args: ENVELOPE_SCHEMA_ARGS, judge: judgeEnvelopeSchema },
];

async function checkPowerstat(dir: string): Promise<SmokeResult> {
  const state = await createPowerLive(dir).read();
  const name = 'powerstat dir';
  if (state === null) return { name, status: 'missing', detail: 'no readable status.json or samples.csv' };
  return state.watts === null
    ? { name, status: 'unparseable', detail: 'status.json is stale or not in the expected shape' }
    : { name, status: 'ok', detail: 'status and samples parse' };
}

type SmokeConfig = {
  powerstatDir?: string;
};

/** Runs the read-only commands Hub depends on and feeds their output through the real parsers. */
export function runSmoke(run: Run, { powerstatDir }: SmokeConfig = {}): Promise<SmokeResult[]> {
  return Promise.all([
    ...checks.map(async ({ name, bin, args, judge }): Promise<SmokeResult> => {
      const result = await run(bin, args);
      const verdict: Verdict =
        result.code === NOT_RUN ? { status: 'missing', detail: 'binary not found or timed out' } : judge(result);
      return { name, ...verdict };
    }),
    ...(powerstatDir ? [checkPowerstat(powerstatDir)] : []),
  ]);
}

if (import.meta.main) {
  const config = loadConfig();
  const results = await runSmoke(realRun, { ...config.system });
  for (const { name, status, detail } of results)
    process.stdout.write(`${status.padEnd(12)}${name.padEnd(26)}${detail}\n`);
  process.exitCode = results.every((r) => r.status === 'ok') ? 0 : 1;
}
