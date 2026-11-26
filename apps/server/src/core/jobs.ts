import { randomUUID } from 'node:crypto';
import { EventEmitter, on } from 'node:events';
import type { Db } from '../db/index.ts';
import type { StreamSpawn } from './exec.ts';

export type JobLine = { id: number; at: number; stream: 'stdout' | 'stderr'; message: string };
type Status = 'queued' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
type Job = {
  id: string;
  action: string;
  status: Status;
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  output: JobLine[];
};
export type TrackedJob = {
  id: string;
  log: (message: string, stream?: JobLine['stream']) => void;
  finish: (status: 'completed' | 'failed' | 'cancelled', exitCode?: number | null) => void;
};
export type TrackJobFn = (action: string, options?: { onCancel?: () => void }) => TrackedJob;

type Running = {
  job: Job;
  process?: { kill: () => void };
  timer?: NodeJS.Timeout;
  nextLine: number;
  onCancel?: () => void;
};
type Pending = Running & { bin: string; args: string[]; timeoutMs: number };

export function createJobRunner(db: Db, spawn: StreamSpawn, maxConcurrent: number) {
  const events = new EventEmitter();
  const active = new Map<string, Pending>();
  const queue: Pending[] = [];
  const tracked = new Map<string, Running>();
  const output = new Map<string, JobLine[]>();
  let closing = false;
  const insert = db.$client.prepare(
    'INSERT INTO jobs (id, action, status, started_at, ended_at, exit_code, output) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const update = db.$client.prepare(
    'UPDATE jobs SET status = ?, started_at = ?, ended_at = ?, exit_code = ?, output = ? WHERE id = ?',
  );
  db.$client.exec(
    "UPDATE jobs SET status = 'cancelled', ended_at = unixepoch() * 1000 WHERE status IN ('running', 'queued')",
  );

  // The list goes to every desk and deck on each status change, so output stays out of it: read it per job.
  function list(): Omit<Job, 'output'>[] {
    const rows = db.$client
      .prepare(
        'SELECT id, action, status, started_at AS startedAt, ended_at AS endedAt, exit_code AS exitCode FROM jobs ORDER BY rowid DESC LIMIT 100',
      )
      .all();
    return rows.map((row) => ({
      id: String(row.id),
      action: String(row.action),
      status: parseStatus(row.status),
      startedAt: Number(row.startedAt),
      endedAt: row.endedAt === null ? null : Number(row.endedAt),
      exitCode: row.exitCode === null ? null : Number(row.exitCode),
    }));
  }
  const storedOutput = db.$client.prepare('SELECT output FROM jobs WHERE id = ?');
  function save(job: Job) {
    update.run(job.status, job.startedAt, job.endedAt, job.exitCode, JSON.stringify(job.output.slice(-50)), job.id);
    events.emit('update');
  }
  function finish(item: Running, status: Status, code: number | null, kill = false) {
    if (item.job.endedAt !== null) return;
    clearTimeout(item.timer);
    item.job.status = status;
    item.job.endedAt = Date.now();
    item.job.exitCode = code;
    save(item.job);
    if (kill && item.process) item.process.kill();
    else {
      active.delete(item.job.id);
      tracked.delete(item.job.id);
      drain();
    }
  }
  function drain() {
    while (active.size < maxConcurrent && queue.length) {
      if (closing) break;
      const item = queue.shift();
      if (!item) break;
      active.set(item.job.id, item);
      item.job.status = 'running';
      item.job.startedAt = Date.now();
      save(item.job);
      item.timer = setTimeout(() => finish(item, 'timeout', null, true), item.timeoutMs);
      try {
        item.process = spawn(
          item.bin,
          item.args,
          (message, stream) => {
            append(item, message, stream);
          },
          (code) => {
            if (item.job.endedAt === null) finish(item, code === 0 ? 'completed' : 'failed', code);
            else {
              active.delete(item.job.id);
              drain();
            }
          },
        );
      } catch {
        finish(item, 'failed', null);
      }
    }
  }
  function register(action: string, status: 'queued' | 'running') {
    if (closing) throw new Error('Job runner is closed');
    const job: Job = {
      id: randomUUID(),
      action,
      status,
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      output: [],
    };
    insert.run(job.id, action, job.status, job.startedAt, null, null, '[]');
    db.$client.exec(
      "DELETE FROM jobs WHERE rowid NOT IN (SELECT rowid FROM jobs ORDER BY rowid DESC LIMIT 100) AND status NOT IN ('queued', 'running')",
    );
    const retained = new Set(list().map((row) => row.id));
    for (const id of output.keys())
      if (!retained.has(id) && !active.has(id) && !tracked.has(id) && !queue.some((item) => item.job.id === id))
        output.delete(id);
    output.set(job.id, job.output);
    return job;
  }
  function append(item: Running, message: string, stream: JobLine['stream']) {
    if (item.job.endedAt !== null) return;
    const line = { id: item.nextLine++, at: Date.now(), stream, message };
    item.job.output.push(line);
    if (item.job.output.length > 500) item.job.output.shift();
    events.emit(`output:${item.job.id}`, line);
  }
  const track: TrackJobFn = (action, options) => {
    const job = register(action, 'running');
    const item: Running = { job, nextLine: 0, onCancel: options?.onCancel };
    tracked.set(job.id, item);
    events.emit('update');
    return {
      id: job.id,
      log: (message, stream = 'stdout') => append(item, message, stream),
      finish: (status, exitCode = null) => finish(item, status, exitCode),
    };
  };
  function start(action: string, bin: string, args: string[], timeoutMs = 600_000) {
    const job = register(action, 'queued');
    queue.push({ job, bin, args, timeoutMs, nextLine: 0 });
    events.emit('update');
    drain();
    return job.id;
  }
  function cancel(id: string) {
    const index = queue.findIndex((item) => item.job.id === id);
    const item = index >= 0 ? queue.splice(index, 1)[0] : (active.get(id) ?? tracked.get(id));
    if (!item) return false;
    finish(item, 'cancelled', null, true);
    item.onCancel?.();
    return true;
  }
  function close() {
    closing = true;
    for (const item of [...queue, ...active.values(), ...tracked.values()]) cancel(item.job.id);
  }
  function readOutput(id: string, limit = 500) {
    return (output.get(id) ?? parseOutput(storedOutput.get(id)?.output)).slice(-Math.min(limit, 500));
  }
  async function* updates(signal?: AbortSignal) {
    const changes = on(events, 'update', { signal });
    yield list();
    for await (const _ of changes) yield list();
  }
  async function* lines(id: string, signal?: AbortSignal): AsyncGenerator<JobLine> {
    for await (const [line] of on(events, `output:${id}`, { signal })) yield line;
  }
  // For the e2e fake: history is per process, so a spec that needs an empty list clears it first.
  function clearHistory() {
    db.$client.exec("DELETE FROM jobs WHERE status NOT IN ('queued', 'running')");
    for (const id of output.keys())
      if (!active.has(id) && !tracked.has(id) && !queue.some((item) => item.job.id === id)) output.delete(id);
    events.emit('update');
  }
  return { start, track, list, output: readOutput, cancel, close, updates, lines, clearHistory };
}

function parseStatus(value: unknown): Status {
  if (
    value === 'queued' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'timeout' ||
    value === 'cancelled'
  )
    return value;
  throw new Error('Invalid job status');
}
function parseOutput(value: unknown): JobLine[] {
  if (typeof value !== 'string') return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (line): line is JobLine =>
      typeof line === 'object' &&
      line !== null &&
      typeof line.id === 'number' &&
      typeof line.at === 'number' &&
      (line.stream === 'stdout' || line.stream === 'stderr') &&
      typeof line.message === 'string',
  );
}
