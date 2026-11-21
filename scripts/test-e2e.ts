import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPrivateE2eFolders } from './test-e2e-private.ts';
import { defaultModuleRoots } from '../apps/server/src/core/discovery.ts';

// Each e2e process owns a fake desktop, two free ports and a temp folder (`apps/e2e/tests/hosts.ts`), so running the
// suite as N shards in parallel is N independent runs: no worker shares audio, media, pairing or a scheme file.
// Four processes at once is the owner's OK of 2026-11-13 (12 cores) and the hard cap. Three is what runs: the private pass (3 min, the
// critical path) bounds the wall time anyway, and with a fourth process the timing-sensitive Pomodoro specs failed under load.
export const WORKERS = 4;

/** Caps concurrent e2e processes via `HUB_E2E_WORKERS` (clamped to `1..WORKERS`) for constrained CI runners. */
export function resolveWorkers(raw = process.env.HUB_E2E_WORKERS): number {
  if (!raw || !/^\d+$/.test(raw.trim())) return WORKERS;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Math.min(WORKERS, Math.max(1, parsed));
}

export interface Job {
  label: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** Runs `jobs` in order with at most `slots` at once; a failing job stops new ones, running ones finish. Exit code. */
export async function runQueue(jobs: Job[], slots: number, runJob: (job: Job) => Promise<number>) {
  let next = 0;
  let failed = false;
  async function slot() {
    while (!failed && next < jobs.length) {
      const job = jobs[next++];
      if (job && (await runJob(job)) !== 0) failed = true;
    }
  }
  await Promise.all(Array.from({ length: Math.min(slots, jobs.length) }, slot));
  return failed ? 1 : 0;
}

/** Longest-processing-time-first: the heaviest file goes to the lightest bin. Bins come back heaviest first. */
export function balance(files: { file: string; weight: number }[], bins: number) {
  const out = Array.from({ length: bins }, () => ({ files: [] as string[], weight: 0 }));
  for (const item of files.toSorted((a, b) => b.weight - a.weight)) {
    const lightest = out.reduce((min, bin) => (bin.weight < min.weight ? bin : min));
    lightest.files.push(item.file);
    lightest.weight += item.weight;
  }
  return out.filter((bin) => bin.files.length > 0).toSorted((a, b) => b.weight - a.weight);
}

interface ReportSuite {
  file?: string;
  suites?: ReportSuite[];
  specs?: { tests: { results: { duration: number }[] }[] }[];
}

/** Per spec file: test count and total duration in ms, from a Playwright JSON report (`--list` gives 0 ms). */
export function fileStats(report: { suites?: ReportSuite[] }) {
  const stats = new Map<string, { tests: number; ms: number }>();
  function walk(suite: ReportSuite, file: string) {
    const entry = stats.get(file) ?? { tests: 0, ms: 0 };
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests) {
        entry.tests += 1;
        entry.ms += test.results.reduce((sum, r) => sum + r.duration, 0);
      }
    stats.set(file, entry);
    for (const child of suite.suites ?? []) walk(child, file);
  }
  for (const suite of report.suites ?? []) if (suite.file) walk(suite, suite.file);
  return stats;
}

/**
 * A lock between sessions: the file holds the owner's pid; one whose pid is gone is taken over.
 * shortcut: two takers of the same stale lock can race between the read and the rm, rare enough for a dev machine.
 */
export async function acquireLock(
  path: string,
  options: {
    alive?: (pid: number) => boolean;
    sleep?: (ms: number) => Promise<void>;
    onWait?: (pid: number) => void;
  } = {},
) {
  const alive =
    options.alive ??
    ((pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return error instanceof Error && 'code' in error && error.code === 'EPERM';
      }
    });
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  let told = false;
  for (;;) {
    try {
      writeFileSync(path, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }), { flag: 'wx' });
      return () => rmSync(path, { force: true });
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    }
    const holder = readHolder(path);
    if (holder === undefined || !alive(holder)) {
      rmSync(path, { force: true });
      continue;
    }
    if (!told) options.onWait?.(holder);
    told = true;
    await sleep(2000);
  }
}

function readHolder(path: string) {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null && 'pid' in parsed && typeof parsed.pid === 'number'
      ? parsed.pid
      : undefined;
  } catch {
    return undefined;
  }
}

// One production build per variant (`vite build` bakes the module root and the example flag), served by `vite preview`
// per process: the dev server transformed hundreds of modules on every page load and made the suite about 3x slower.
interface Variant {
  name: string;
  moduleRoot: string;
  examples: boolean;
  shards: number;
  /** Set for a private module: its e2e folder, run by `scripts/test-e2e-private.ts`. */
  privateFolder?: string;
}

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDir = (name: string) => join(root, 'apps/web/node_modules/.e2e-dist', name);
const playwright = ['--filter', '@hub/e2e', 'e2e'];

// Specs that stay on a Vite dev server, in one job of their own. palette.visual: zero-tolerance baselines made on the dev
// server, and the 4K palette opens 1 px higher on a production build, deterministically. pomodoro: on a build the digits
// of a remounted timer stayed at 00:00 in about 1 run of 4 (never on dev), possibly a product bug: see plan 49 Progress.
const devServerSpecs = ['palette.visual.spec.ts', 'pomodoro.spec.ts'];

function variants(): Variant[] {
  const override = process.env.HUB_MODULES_ROOT;
  const list: Variant[] = [
    { name: 'public', moduleRoot: override ?? '/tmp/hub-e2e-no-modules', examples: false, shards: 3 },
    { name: 'example', moduleRoot: override ?? join(root, 'modules.example'), examples: true, shards: 2 },
  ];
  const privateRoot = override ?? defaultModuleRoots[0];
  for (const folder of findPrivateE2eFolders(privateRoot))
    list.push({
      name: `private-${folder.name}`,
      moduleRoot: join(folder.path, 'root'),
      examples: false,
      shards: 1,
      privateFolder: folder.path,
    });
  return list;
}

const variantEnv = (v: Variant) => ({
  HUB_MODULES_ROOT: v.moduleRoot,
  HUB_EXAMPLE_MODULES: v.examples ? '1' : '0',
});

const served = (v: Variant): Record<string, string> => (v.privateFolder ? {} : { HUB_E2E_DIST: distDir(v.name) });

const buildJob = (v: Variant): Job => ({
  label: `build ${v.name}`,
  command: 'pnpm',
  args: ['--filter', '@hub/web', 'exec', 'vite', 'build', '--outDir', distDir(v.name), '--emptyOutDir'],
  // The dev server these tests used to run on had the flag off (`playwright.config.ts` pins it): modules.example already
  // arrives through the module-root glob, so the second glob would register every example twice.
  env: { ...variantEnv(v), HUB_EXAMPLE_MODULES: '0' },
});

const gitPath = (name: string) =>
  resolve(root, spawnSync('git', ['rev-parse', '--git-path', name], { cwd: root, encoding: 'utf8' }).stdout.trim());

/** Seconds per spec file of the last runs, key `<variant>:<file>`; weights the next partition. Absent on a first run. */
function readDurations(path: string): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
  } catch {
    return {};
  }
}

function readStats(file: string) {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return fileStats(typeof parsed === 'object' && parsed !== null ? parsed : {});
}

function listFiles(v: Variant, reports: string) {
  const out = join(reports, `list-${v.name}.json`);
  spawnSync('pnpm', [...playwright, '--list', '--reporter=json'], {
    env: { ...process.env, ...variantEnv(v), HUB_E2E_DIST: distDir(v.name), PLAYWRIGHT_JSON_OUTPUT_FILE: out },
    stdio: 'ignore',
  });
  if (!existsSync(out)) throw new Error(`e2e: could not list the specs of ${v.name}`);
  return [...readStats(out)].filter(([file]) => !file.endsWith('.setup.ts'));
}

function planJobs(all: Variant[], reports: string, durations: Record<string, number>) {
  const jobs: Job[] = [];
  const reportOf: Record<string, string> = {};
  for (const v of all) {
    const env = { ...variantEnv(v), ...served(v) };
    if (v.privateFolder) {
      // The longest pass starts first.
      jobs.unshift({
        label: v.name,
        command: 'node',
        args: ['scripts/test-e2e-private.ts'],
        env: { ...env, HUB_E2E_PRIVATE: v.privateFolder },
      });
      continue;
    }
    const listed = listFiles(v, reports);
    const files = listed.filter(([file]) => !devServerSpecs.includes(file));
    const onDev = devServerSpecs.filter((spec) => listed.some(([file]) => file === spec));
    if (onDev.length)
      jobs.unshift({
        label: `${v.name}-dev 1/1`,
        command: 'pnpm',
        args: [...playwright, ...onDev.map((f) => `tests/${f}`)],
        env: { ...variantEnv(v) },
      });
    // shortcut: a file with no recorded time weighs 2 s a test; the next run records the real one.
    const weighted = files.map(([file, { tests }]) => ({ file, weight: durations[`${v.name}:${file}`] ?? tests * 2 }));
    balance(weighted, v.shards).forEach((bin, i, bins) => {
      const label = `${v.name} ${i + 1}/${bins.length}`;
      const report = join(reports, `${v.name}-${i + 1}.json`);
      reportOf[label] = report;
      jobs.push({
        label,
        command: 'pnpm',
        args: [...playwright, '--reporter=list,json', ...bin.files.map((f) => `tests/${f}`)],
        env: { ...env, PLAYWRIGHT_JSON_OUTPUT_FILE: report },
      });
    });
  }
  return { jobs, reportOf };
}

const running = new Set<number>();

function run(job: Job, quiet = false) {
  return new Promise<number>((resolveRun) => {
    // Its own process group, so a signal to the runner reaches pnpm, Playwright, Vite and the fake server.
    const child = spawn(job.command, job.args, {
      env: { ...process.env, ...job.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    if (child.pid) running.add(child.pid);
    const lines: [NodeJS.WriteStream, string][] = [];
    for (const [stream, out] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ] as const) {
      let rest = '';
      const emit = (line: string) => (quiet ? lines.push([out, line]) : out.write(`[${job.label}] ${line}\n`));
      stream.on('data', (chunk: Buffer) => {
        const parts = (rest + chunk.toString()).split('\n');
        rest = parts.pop() ?? '';
        parts.forEach(emit);
      });
      stream.on('end', () => rest && emit(rest));
    }
    child.on('close', (code) => {
      if (child.pid) running.delete(child.pid);
      const result = code ?? 1;
      if (quiet && result !== 0) for (const [out, line] of lines) out.write(`[${job.label}] ${line}\n`);
      resolveRun(result);
    });
  });
}

function recordDurations(path: string, reportOf: Record<string, string>) {
  const durations = readDurations(path);
  for (const [label, report] of Object.entries(reportOf)) {
    if (!existsSync(report)) continue;
    const variant = label.split(' ')[0];
    for (const [file, { ms }] of readStats(report))
      if (!file.endsWith('.setup.ts')) durations[`${variant}:${file}`] = ms / 1000;
  }
  writeFileSync(path, JSON.stringify(durations));
}

let releaseLock = () => {};

async function main() {
  const reports = mkdtempSync(join(tmpdir(), 'hub-e2e-reports-'));
  releaseLock = await acquireLock(gitPath('hub-e2e-lock'), {
    onWait: (pid) => process.stdout.write(`e2e: another run (pid ${pid}) holds the lock, waiting for it\n`),
  });
  const durationsPath = gitPath('hub-e2e-durations.json');
  try {
    const all = variants();
    const builds = await Promise.all(all.filter((v) => !v.privateFolder).map((v) => run(buildJob(v), true)));
    if (builds.some((code) => code !== 0)) return 1;
    const { jobs, reportOf } = planJobs(all, reports, readDurations(durationsPath));
    const workers = resolveWorkers();
    process.stdout.write(`e2e: ${jobs.length} jobs, ${workers} slots: ${jobs.map((j) => j.label).join(', ')}\n`);
    const started = Date.now();
    const code = await runQueue(jobs, workers, async (job) => {
      const t = Date.now();
      const result = await run(job);
      process.stdout.write(`e2e: ${job.label} exit ${result} after ${Math.round((Date.now() - t) / 1000)}s\n`);
      return result;
    });
    process.stdout.write(`e2e: queue done in ${Math.round((Date.now() - started) / 1000)}s\n`);
    recordDurations(durationsPath, reportOf);
    return code;
  } finally {
    releaseLock();
    rmSync(reports, { recursive: true, force: true });
  }
}

const finish = (code: number) => {
  // Under `scripts/verify.ts` the outer runner writes the one EXIT line.
  if (!process.env.HUB_VERIFY) process.stdout.write(`EXIT ${code}\n`);
  process.exit(code);
};

if (import.meta.main) {
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      releaseLock();
      for (const pid of running) {
        try {
          process.kill(-pid, 'SIGTERM');
        } catch {
          // already gone
        }
      }
      finish(signal === 'SIGINT' ? 130 : 143);
    });
  main().then(finish, (error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    finish(1);
  });
}
