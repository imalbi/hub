import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePrivateWords, scanContent, type Finding } from './private-scanner.ts';

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function isMissing(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function loadRepoPrivateWords(cwd: string): string[] {
  const root = git(cwd, ['rev-parse', '--show-toplevel']).trim();
  const tracked = git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
  if (tracked.includes('.private-words')) return [];
  const wordPath = join(root, '.private-words');
  try {
    if (!lstatSync(wordPath).isFile()) throw new Error('Private word list must be a regular file');
    return parsePrivateWords(readFileSync(wordPath, 'utf8'));
  } catch (error) {
    if (isMissing(error)) return [];
    throw new Error('Unable to read private word list', { cause: error });
  }
}

export function stripGitComments(message: string): string {
  return message
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('#'))
    .join('\n');
}

export function scanCommitMessage(
  message: string,
  privateWords: readonly string[] = [],
  label = 'commit-msg',
): Finding[] {
  const cleaned = stripGitComments(message);
  if (!cleaned.trim()) return [];
  return scanContent(label, cleaned, privateWords);
}

export function scanCommitRange(
  cwd: string,
  revArgs: readonly string[],
  privateWords: readonly string[] = [],
): Finding[] {
  if (revArgs.length === 0) return [];
  const raw = git(cwd, ['log', ...revArgs, '--format=%H%x01%B%x00']);
  const findings: Finding[] = [];
  for (const record of raw.split('\0')) {
    if (!record) continue;
    const sep = record.indexOf('\x01');
    if (sep < 0) continue;
    const hash = record.slice(0, sep).trim().slice(0, 7);
    const body = record.slice(sep + 1);
    findings.push(...scanCommitMessage(body, privateWords, `commit:${hash}`));
  }
  return findings;
}

function reportFindings(findings: readonly Finding[]): number {
  for (const finding of findings) {
    process.stdout.write(`${finding.file}:${finding.line}: ${finding.rule}: ${finding.masked}\n`);
  }
  return findings.length === 0 ? 0 : 1;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    process.stdout.write('Usage: guard-commits.ts --message-file <path> | --range <git-rev-args...>\n');
    return args.includes('--help') ? 0 : 1;
  }

  let words: string[];
  try {
    words = loadRepoPrivateWords(process.cwd());
  } catch (error) {
    process.stderr.write(
      `guard-commits: ${error instanceof Error ? error.message : 'Unable to read private word list'}.\n`,
    );
    return 1;
  }

  if (args[0] === '--message-file' && args[1]) {
    const text = readFileSync(args[1], 'utf8');
    return reportFindings(scanCommitMessage(text, words));
  }
  if (args[0] === '--range' && args.length >= 2) {
    return reportFindings(scanCommitRange(process.cwd(), args.slice(1), words));
  }

  process.stderr.write('guard-commits: invalid arguments. Use --help.\n');
  return 1;
}

if (import.meta.main) process.exitCode = main();
