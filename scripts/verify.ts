// `pnpm verify`: check, e2e, web build, stamp. Always ends with one `EXIT <code>` line (also on a failed step or a signal),
// so a waiter never needs to poll a log for a line that may never come.
import { spawn } from 'node:child_process';

const steps = [
  ['pnpm', 'check'],
  ['node', 'scripts/test-e2e.ts'],
  ['pnpm', '--filter', '@hub/web', 'build'],
  ['node', 'scripts/verify-stamp.ts', 'write'],
];

let current: ReturnType<typeof spawn> | undefined;

function finish(code: number) {
  process.stdout.write(`EXIT ${code}\n`);
  process.exit(code);
}

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
