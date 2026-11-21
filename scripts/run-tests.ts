import { spawn } from 'node:child_process';
import { globSync } from 'node:fs';

// Strip ANSI escapes so summary detection works identically across TTY and piped runs.
const ANSI = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, 'g');

export function expandGlobs(patterns: readonly string[], cwd = process.cwd()): string[] {
  const files = new Set<string>();
  for (const pattern of patterns) {
    for (const match of globSync(pattern, { cwd })) {
      files.add(match);
    }
  }
  return [...files].toSorted();
}

export function extractTestCount(output: string): number {
  const clean = output.replace(ANSI, '');
  const match = /^(?:ℹ|#)\s*tests\s+(\d+)\b/gm;
  let last: number | undefined;
  for (const item of clean.matchAll(match)) {
    last = Number(item[1]);
  }
  return last ?? 0;
}

export async function runTestGlobs(patterns: readonly string[], cwd = process.cwd()): Promise<number> {
  if (patterns.length === 0) {
    process.stderr.write('run-tests: expected at least one glob pattern\n');
    return 1;
  }
  const files = expandGlobs(patterns, cwd);
  if (files.length === 0) {
    process.stderr.write(`run-tests: no test files matched: ${patterns.join(' ')}\n`);
    return 1;
  }

  let captured = '';
  const child = spawn(process.execPath, ['--test', '--test-reporter=spec', ...files], {
    cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    captured += text;
    process.stdout.write(text);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk);
  });

  const code = await new Promise<number>((done) => {
    child.on('close', (status) => done(status ?? 1));
  });
  if (code !== 0) return code;

  const total = extractTestCount(captured);
  if (total <= 0) {
    process.stderr.write('run-tests: 0 tests executed; failing\n');
    return 1;
  }
  return 0;
}

if (import.meta.main) {
  process.exitCode = await runTestGlobs(process.argv.slice(2));
}
