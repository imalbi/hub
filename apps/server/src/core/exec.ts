import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export type StreamSpawn = (
  bin: string,
  args: string[],
  line: (text: string, stream: 'stdout' | 'stderr') => void,
  end: (code: number | null) => void,
) => { kill: () => void };

export const streamSpawn: StreamSpawn = (bin, args, line, end) => {
  const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  createInterface({ input: child.stdout }).on('line', (text) => line(text, 'stdout'));
  createInterface({ input: child.stderr }).on('line', (text) => line(text, 'stderr'));
  child.on('error', () => {});
  child.on('close', end);
  return {
    kill: () => {
      child.kill('SIGKILL');
    },
  };
};

export type RunResult = { stdout: string; stderr: string; code: number };
export type Run = (bin: string, args: string[], options?: { timeoutMs?: number }) => Promise<RunResult>;

// pw-dump on a busy desktop is hundreds of KB and grows with every stream; Node's 1 MB default would kill it.
const MAX_BUFFER = 16 * 1024 * 1024;

/** Spawns `bin` with an argument array (never a shell). A non-zero exit, a missing binary or a timeout is a code, not a throw. */
export const run: Run = (bin, args, { timeoutMs = 3000 } = {}) =>
  new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: MAX_BUFFER, encoding: 'utf8' }, (error, stdout, stderr) => {
      // error.code is the exit status for a failed run, and a string (ENOENT) or null (killed) otherwise.
      resolve({ stdout, stderr, code: error ? (typeof error.code === 'number' ? error.code : -1) : 0 });
    });
  });
