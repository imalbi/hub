import { z } from 'zod';
import type { Run } from '../../core/exec.ts';
import { createLiveHub } from '../../core/live.ts';
import type { MonitorConfig } from './config.ts';

/** `absent` is an output Hyprland does not list at all (cable out); `unknown` is a read that failed or did not parse. */
export type MonitorState = 'on' | 'off' | 'absent' | 'unknown';
export type MonitorStatus = {
  output: string;
  label: string;
  state: MonitorState;
  orientation: 'horizontal' | 'vertical' | null;
};

// Only the fields Hub reads; the rest of the object is Hyprland's business.
const monitorsJson = z.array(
  z.object({ name: z.string(), disabled: z.boolean(), transform: z.number().int().optional() }),
);

/** Every monitor Hyprland lists, active or not; null when the answer is not the expected JSON (smoke reads it too). */
export function parseMonitorList(stdout: string) {
  const parsed = monitorsJson.safeParse(parseJson(stdout));
  return parsed.success ? parsed.data : null;
}

/** One `hyprctl monitors all -j` answer matched to every configured entry by `name`; a garbled answer is unknown for all. */
export function parseMonitors(stdout: string, entries: readonly MonitorConfig[]): MonitorStatus[] {
  const listed = parseMonitorList(stdout);
  return entries.map(({ output, label }) => {
    if (!listed) return { output, label, state: 'unknown', orientation: null };
    const found = listed.find((monitor) => monitor.name === output);
    return {
      output,
      label,
      state: found ? (found.disabled ? 'off' : 'on') : 'absent',
      orientation:
        !found || found.disabled || found.transform === undefined
          ? null
          : found.transform % 2 === 1
            ? 'vertical'
            : 'horizontal',
    };
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function readMonitors(run: Run, entries: readonly MonitorConfig[]) {
  // No entry, nothing to read: the desktop is not asked.
  if (entries.length === 0) return [];
  const { stdout, code } = await run('hyprctl', ['monitors', 'all', '-j']);
  return parseMonitors(code === 0 ? stdout : '', entries).map((monitor, index) => ({
    ...monitor,
    supportsHorizontal: entries[index]?.horizontalCommand !== undefined,
    supportsVertical: entries[index]?.verticalCommand !== undefined,
  }));
}

// The poll is the fallback decision 2 names: it also catches the owner's own shortcut, within a few seconds.
export const createMonitorLive = (run: Run, entries: readonly MonitorConfig[], intervalMs = 5000) =>
  createLiveHub(() => readMonitors(run, entries), intervalMs);

export type MonitorLive = ReturnType<typeof createMonitorLive>;
