import { spawn } from 'node:child_process';

// Each e2e process owns a fake desktop, two free ports and a temp folder (`apps/e2e/tests/hosts.ts`), so running the
// suite as N shards in parallel is N independent runs: no worker shares audio, media, pairing or a scheme file.
export const WORKERS = 2;

export interface Job {
  label: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

const playwright = ['--filter', '@hub/e2e', 'e2e'];

/**
 * Stage 1: the public pass in `workers` shards. Stage 2: the example-modules pass next to the private modules' own pass
 * (it exits 0 when there are none). Never more than `workers` processes at once, so the machine stays predictable.
 */
export function planStages(workers: number): Job[][] {
  const shards = Array.from({ length: workers }, (_, i) => ({
    label: `public ${i + 1}/${workers}`,
    command: 'pnpm',
    args: [...playwright, `--shard=${i + 1}/${workers}`],
    env: {},
  }));
  return [
    shards,
    [
      { label: 'example', command: 'pnpm', args: playwright, env: { HUB_EXAMPLE_MODULES: '1' } },
      { label: 'private', command: 'node', args: ['scripts/test-e2e-private.ts'], env: {} },
    ],
  ];
}

function run(job: Job) {
  return new Promise<number>((resolve) => {
    const child = spawn(job.command, job.args, {
      env: { ...process.env, ...job.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const [stream, out] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ] as const) {
      let rest = '';
      stream.on('data', (chunk: Buffer) => {
        const lines = (rest + chunk.toString()).split('\n');
        rest = lines.pop() ?? '';
        for (const line of lines) out.write(`[${job.label}] ${line}\n`);
      });
      stream.on('end', () => {
        if (rest) out.write(`[${job.label}] ${rest}\n`);
      });
    }
    child.on('close', (code) => resolve(code ?? 1));
  });
}

if (import.meta.main) {
  for (const stage of planStages(WORKERS)) {
    const codes = await Promise.all(stage.map(run));
    if (codes.some((code) => code !== 0)) {
      process.exitCode = 1;
      break;
    }
  }
}
