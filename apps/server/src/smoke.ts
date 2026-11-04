import { run as realRun, type Run, type RunResult } from './core/exec.ts';
import { parsePwDump } from './modules/audio/pipewire.ts';
import { MEDIA_FORMAT, parseMediaState } from './modules/media/playerctl.ts';

export type SmokeResult = { name: string; status: 'ok' | 'missing' | 'unparseable'; detail: string };
type Verdict = Pick<SmokeResult, 'status' | 'detail'>;

// `run` reports a missing binary, and also a timeout, as -1.
const NOT_RUN = -1;

const exitDetail = ({ code, stderr }: RunResult) => `exit ${code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`;

const judgeVersion = (result: RunResult): Verdict =>
  result.code === 0
    ? { status: 'ok', detail: result.stdout.trim() }
    : { status: 'unparseable', detail: exitDetail(result) };

// wpctl has no --version. Its help is a cheap, read-only proof that the one subcommand Hub mutates with is still there.
function judgeWpctlHelp(result: RunResult): Verdict {
  if (result.code !== 0) return { status: 'unparseable', detail: exitDetail(result) };
  return result.stdout.includes('set-default')
    ? { status: 'ok', detail: 'set-default listed' }
    : { status: 'unparseable', detail: 'set-default not listed in the help' };
}

function judgeNotifyHelp(result: RunResult): Verdict {
  return result.code === 0 && result.stdout.includes('--app-name')
    ? { status: 'ok', detail: 'app-name option listed' }
    : { status: 'unparseable', detail: result.code === 0 ? 'app-name not listed in the help' : exitDetail(result) };
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

// Read-only on purpose: no `set-default`, no `play-pause`. This runs against the real desktop.
const checks = [
  { name: 'wpctl --help', bin: 'wpctl', args: ['--help'], judge: judgeWpctlHelp },
  { name: 'playerctl --version', bin: 'playerctl', args: ['--version'], judge: judgeVersion },
  { name: 'pw-dump', bin: 'pw-dump', args: [], judge: judgePwDump },
  { name: 'playerctl metadata', bin: 'playerctl', args: ['metadata', '--format', MEDIA_FORMAT], judge: judgeMetadata },
  { name: 'notify-send --help', bin: 'notify-send', args: ['--help'], judge: judgeNotifyHelp },
];

/** Runs the read-only commands Hub depends on and feeds their output through the real parsers. */
export function runSmoke(run: Run): Promise<SmokeResult[]> {
  return Promise.all(
    checks.map(async ({ name, bin, args, judge }): Promise<SmokeResult> => {
      const result = await run(bin, args);
      const verdict: Verdict =
        result.code === NOT_RUN ? { status: 'missing', detail: 'binary not found or timed out' } : judge(result);
      return { name, ...verdict };
    }),
  );
}

if (import.meta.main) {
  const results = await runSmoke(realRun);
  for (const { name, status, detail } of results)
    process.stdout.write(`${status.padEnd(12)}${name.padEnd(22)}${detail}\n`);
  process.exitCode = results.every((r) => r.status === 'ok') ? 0 : 1;
}
