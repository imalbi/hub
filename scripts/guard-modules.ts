import { execFileSync } from 'node:child_process';
import { readTrackedWorktree } from './guard-private.ts';
import { ignoresModules, moduleImportViolation } from './module-imports.ts';

export function guardModules(cwd: string, staged: boolean) {
  const git = (args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const files = git(['ls-files', '-z']).split('\0').filter(Boolean);
  const read = (file: string) =>
    staged ? git(['show', `:${file}`]) : (readTrackedWorktree(cwd, file)?.toString('utf8') ?? '');
  const findings: string[] = [];
  if (!files.includes('.gitignore') || !ignoresModules(read('.gitignore')))
    findings.push('Private module directory must be ignored');
  for (const file of files) {
    if (!/\.(?:[cm]?[jt]sx?|json)$/.test(file)) continue;
    if (moduleImportViolation(file, read(file))) findings.push(`Private source path outside discovery: ${file}`);
  }
  return findings;
}
if (import.meta.main) {
  const findings = guardModules(
    process.cwd(),
    process.env.HUB_GUARD_STAGED === '1' || process.argv.includes('--staged'),
  );
  for (const finding of findings) process.stderr.write(`${finding}\n`);
  process.stdout.write(`guard-modules: ${findings.length} findings.\n`);
  process.exitCode = findings.length ? 1 : 0;
}
