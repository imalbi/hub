import type { Config } from '../../core/config.ts';
import type { Run } from '../../core/exec.ts';
import { createLiveHub } from '../../core/live.ts';
import { currentOutput, parsePwDump, resolveOutputs } from './pipewire.ts';

export async function readSnapshot(run: Run) {
  const { stdout, code } = await run('pw-dump', []);
  return parsePwDump(code === 0 ? stdout : '');
}

export async function readAudioState(run: Run, config: Config) {
  const { sinks, defaultName } = await readSnapshot(run);
  const resolved = resolveOutputs(sinks, config.audio.outputs);
  const current = currentOutput(resolved, defaultName);
  return {
    current: current && { label: current.label },
    outputs: resolved.map((o) => ({ label: o.label, available: o.sink !== null })),
  };
}

export const createAudioLive = (run: Run, config: Config) => createLiveHub(() => readAudioState(run, config));
export type AudioLive = ReturnType<typeof createAudioLive>;
