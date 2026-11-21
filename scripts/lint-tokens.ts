import { globSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

export type TokenViolation = { file: string; line: number; rule: 'arbitrary-value' | 'font-mono'; text: string };

const ARBITRARY_UTILITY = /(^|[" :])(-?[a-z]+(-[a-z]+)*)-\[/u;
const FONT_MONO = /\bfont-mono\b/u;

export function lintTokens(rootDir: string): TokenViolation[] {
  const base = resolve(rootDir);
  const files = globSync('**/*.tsx', { cwd: base }).toSorted();
  const violations: TokenViolation[] = [];

  for (const rawRel of files) {
    const posix = rawRel.replaceAll('\\', '/');
    if (/(?:^|\/)paraglide\//.test(posix) || /(?:^|\/)components\/ui\//.test(posix)) continue;
    const full = resolve(base, rawRel);
    const lines = readFileSync(full, 'utf8').split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const arb = ARBITRARY_UTILITY.exec(line);
      if (arb) {
        violations.push({
          file: relative(process.cwd(), full).replaceAll('\\', '/') || posix,
          line: index + 1,
          rule: 'arbitrary-value',
          text: arb[0].trim(),
        });
      }
      if (FONT_MONO.test(line)) {
        violations.push({
          file: relative(process.cwd(), full).replaceAll('\\', '/') || posix,
          line: index + 1,
          rule: 'font-mono',
          text: 'font-mono',
        });
      }
    }
  }
  return violations;
}

if (import.meta.main) {
  const target = process.argv[2] ?? 'src';
  const violations = lintTokens(target);
  for (const v of violations) {
    process.stderr.write(`${v.file}:${v.line}: ${v.rule} (${v.text})\n`);
  }
  process.exitCode = violations.length === 0 ? 0 : 1;
}
