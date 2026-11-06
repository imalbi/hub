import type { z } from 'zod';
import type { configSchema } from './config.ts';
import type { Run } from '../../core/exec.ts';
import { createLiveHub } from '../../core/live.ts';
import { currentOutput, parsePwDump, parseVolume, resolveOutputs } from './pipewire.ts';

export async function readSnapshot(run: Run) {
  const { stdout, code } = await run('pw-dump', []);
  return parsePwDump(code === 0 ? stdout : '');
}

export async function readVolume(run: Run, target: '@DEFAULT_AUDIO_SINK@' | '@DEFAULT_AUDIO_SOURCE@') {
  const { stdout, code } = await run('wpctl', ['get-volume', target]);
  return code === 0 ? parseVolume(stdout) : null;
}

export async function readAudioState(run: Run, config: { audio: z.output<typeof configSchema> }) {
  const [{ sinks, defaultName }, sinkVolume, sourceVolume] = await Promise.all([
    readSnapshot(run),
    readVolume(run, '@DEFAULT_AUDIO_SINK@'),
    readVolume(run, '@DEFAULT_AUDIO_SOURCE@'),
  ]);
  const resolved = resolveOutputs(sinks, config.audio.outputs);
  const current = currentOutput(resolved, defaultName);
  return {
    current: current && { label: current.label },
    outputs: resolved.map((o) => ({ label: o.label, available: o.sink !== null })),
    volume: sinkVolume?.volume ?? 1,
    muted: sinkVolume?.muted ?? false,
    micMuted: sourceVolume?.muted ?? false,
  };
}

export const createAudioLive = (run: Run, config: { audio: z.output<typeof configSchema> }) =>
  createLiveHub(() => readAudioState(run, config));
export type AudioLive = ReturnType<typeof createAudioLive>;
