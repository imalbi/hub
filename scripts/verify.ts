// `pnpm verify`: check, e2e, web build, stamp. Always ends with one `EXIT <code>` line (also on a failed step or a signal),
// so a waiter never needs to poll a log for a line that may never come.
import { execFileSync, spawn } from 'node:child_process';
import { checkInputHash } from './check.ts';
import { hasPassStamp, stampsPath } from './verify-stamp.ts';

function finish(code: number): never {
  process.stdout.write(`EXIT ${code}\n`);
  process.exit(code);
}

let startTree: string;
let cachedCheck: boolean;
try {
  startTree = execFileSync(process.execPath, ['scripts/verify-stamp.ts', 'tree'], { encoding: 'utf8' }).trim();
  if (!startTree) throw new Error('empty tree hash');
  cachedCheck = process.env.HUB_MODULES_ROOT === undefined && hasPassStamp(stampsPath(), 'check', checkInputHash());
} catch {
  finish(1);
}

if (cachedCheck) process.stdout.write('verify: check skipped (cached)\n');
const steps = [
  ...(cachedCheck ? [] : [['pnpm', 'check']]),
  ['node', 'scripts/test-e2e.ts'],
  ['pnpm', '--filter', '@hub/web', 'build'],
  ['node', 'scripts/verify-stamp.ts', 'write', startTree],
];

let current: ReturnType<typeof spawn> | undefined;

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    current?.kill(signal);
    finish(signal === 'SIGINT' ? 130 : 143);
  });

for (const [command, ...args] of steps) {
  if (!command) continue;
  const code = await new Promise<number>((done) => {
    current = spawn(command, args, { stdio: 'inherit', env: { ...process.env, HUB_VERIFY: '1' } });
    current.on('close', (c) => done(c ?? 1));
  });
  if (code !== 0) finish(code);
}
finish(0);
