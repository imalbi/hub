import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { createLiveHub } from '../../core/live.ts';
import { localMidnight } from '../pomodoro/timer.ts';

// The owner's tracker (powerstat) writes `status.json` every couple of seconds and one row a minute to `samples.csv`.
const statusSchema = z.object({ ts: z.number(), total_w: z.number().nonnegative() });
// Older than this, the tracker is not running and the reading is not "now".
const staleMs = 30_000;
// A longer gap between samples is time the PC was off or the tracker stopped, not consumption.
const maxSampleGapMs = 120_000;

export type PowerState = { watts: number | null; todayKwh: number };

/** Watts right now, or null when the status is missing, malformed or stale. */
export function parsePowerStatus(text: string, now: number): number | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const status = statusSchema.safeParse(json);
  if (!status.success || now - status.data.ts * 1000 > staleMs) return null;
  return status.data.total_w;
}

/**
 * kWh since local midnight from `iso,total_w,...` rows (local time, no offset). Each row stands for the time since the
 * previous one, capped at two minutes. Null when the header lacks those columns.
 */
export function parseTodayKwh(csv: string, now: number): number | null {
  const [header = '', ...rows] = csv.split('\n');
  const columns = header.trim().split(',');
  const isoAt = columns.indexOf('iso');
  const wattsAt = columns.indexOf('total_w');
  if (isoAt === -1 || wattsAt === -1) return null;
  const midnight = localMidnight(now);
  let previous: number | null = null;
  let wattHours = 0;
  for (const row of rows) {
    const fields = row.split(',');
    // A string without an offset is local time in JavaScript, as powerstat writes it.
    const at = Date.parse(fields[isoAt] ?? '');
    const watts = Number(fields[wattsAt]);
    if (Number.isNaN(at) || !Number.isFinite(watts) || watts < 0) continue;
    if (at > midnight && previous !== null) {
      const from = Math.max(previous, midnight);
      const gap = at - from;
      if (gap > 0 && at - previous <= maxSampleGapMs) wattHours += (watts * gap) / 3_600_000;
    }
    previous = at;
  }
  return wattHours / 1000;
}

/** Null when there is no directory or it holds nothing readable: the Sistema zone then hides consumption. */
export function createPowerLive(dir: string | undefined, intervalMs = 5000) {
  // samples.csv grows a row a minute and passes a megabyte: parse it again only when it changed.
  let samples: { mtimeMs: number; kwh: number | null } | undefined;
  async function read(): Promise<PowerState | null> {
    if (!dir) return null;
    const now = Date.now();
    try {
      const file = join(dir, 'samples.csv');
      const { mtimeMs } = await stat(file);
      if (samples?.mtimeMs !== mtimeMs) samples = { mtimeMs, kwh: parseTodayKwh(await readFile(file, 'utf8'), now) };
    } catch {
      samples = undefined;
    }
    const watts = await readFile(join(dir, 'status.json'), 'utf8').then(
      (text) => parsePowerStatus(text, now),
      () => null,
    );
    const todayKwh = samples?.kwh;
    if (todayKwh === undefined || todayKwh === null) return watts === null ? null : { watts, todayKwh: 0 };
    return { watts, todayKwh };
  }
  return { read, ...createLiveHub(read, intervalMs) };
}

export type PowerLive = ReturnType<typeof createPowerLive>;
