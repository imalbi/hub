import { z } from 'zod';

export type Sink = { id: number; name: string; description: string };
export type Output = { label: string; match: string };
export type ResolvedOutput = { label: string; sink: Sink | null };
export type SinkSnapshot = { sinks: Sink[]; defaultName: string | null };

const sinkNodeSchema = z.object({
  id: z.number(),
  type: z.literal('PipeWire:Interface:Node'),
  info: z.object({
    props: z.object({
      'media.class': z.literal('Audio/Sink'),
      'node.name': z.string(),
      'node.description': z.string(),
    }),
  }),
});

const metadataSchema = z.object({
  type: z.literal('PipeWire:Interface:Metadata'),
  metadata: z.array(z.object({ key: z.string(), value: z.unknown() })),
});

const defaultSinkValueSchema = z.object({ name: z.string() });

/** Reads `pw-dump` output. Anything unexpected is skipped: a missing PipeWire is a normal empty state. */
export function parsePwDump(json: string): SinkSnapshot {
  const empty = { sinks: [], defaultName: null };
  let dump: unknown;
  try {
    dump = JSON.parse(json);
  } catch {
    return empty;
  }
  if (!Array.isArray(dump)) return empty;

  const sinks: Sink[] = [];
  let defaultName: string | null = null;
  for (const item of dump) {
    const node = sinkNodeSchema.safeParse(item);
    if (node.success) {
      const { props } = node.data.info;
      sinks.push({ id: node.data.id, name: props['node.name'], description: props['node.description'] });
      continue;
    }
    const metadata = metadataSchema.safeParse(item);
    if (!metadata.success) continue;
    const entry = metadata.data.metadata.find((e) => e.key === 'default.audio.sink');
    const value = defaultSinkValueSchema.safeParse(entry?.value);
    if (value.success) defaultName = value.data.name;
  }
  return { sinks, defaultName };
}

/** Pairs each configured output with the first sink whose description contains its `match`. */
export function resolveOutputs(sinks: Sink[], outputs: Output[]): ResolvedOutput[] {
  return outputs.map(({ label, match }) => ({
    label,
    sink: sinks.find((s) => s.description.toLowerCase().includes(match.toLowerCase())) ?? null,
  }));
}

export function currentOutput(resolved: ResolvedOutput[], defaultName: string | null) {
  return resolved.find((o) => o.sink !== null && o.sink.name === defaultName) ?? null;
}

/** The next available output after the current one, wrapping; the first available if the current sink is not configured. */
export function nextOutput(resolved: ResolvedOutput[], defaultName: string | null) {
  const current = currentOutput(resolved, defaultName);
  const start = current ? resolved.indexOf(current) : -1;
  for (let step = 1; step <= resolved.length; step++) {
    const candidate = resolved[(start + step) % resolved.length];
    if (candidate?.sink) return { label: candidate.label, sink: candidate.sink };
  }
  return null;
}

export type VolumeSnapshot = { volume: number; muted: boolean };

/** Clamps volume between 0 and 1, rounded to 2 decimal places. */
export function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

/** Parses `wpctl get-volume` output. Returns null if unparseable or empty. */
export function parseVolume(output: string): VolumeSnapshot | null {
  const match = output.match(/Volume:\s*([0-9.]+)/i);
  if (!match?.[1]) return null;
  const raw = Number.parseFloat(match[1]);
  if (Number.isNaN(raw)) return null;
  return {
    volume: clampVolume(raw),
    muted: /\[MUTED\]/i.test(output),
  };
}
