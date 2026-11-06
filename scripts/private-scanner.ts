import { Buffer } from 'node:buffer';
import { isIP } from 'node:net';

export type Finding = { file: string; line: number; rule: string; masked: string };

const HOME_PATH = /\/(?:home|Users)\/[^/\s"'`<>]+(?:\/|(?=$|[\s"'`<>]))/g;
const IPV4 = /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?!\w|\.\d)/g;
const LAN_HOSTNAME = /(?<![\w.-])(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+local(?![\w-]|\.[a-z\d-])/gi;
const MAC_ADDRESS =
  /(?<![\w:-])(?:[a-f\d]{2}:){5}[a-f\d]{2}(?![\w:])|(?<![\w-])(?:[a-f\d]{2}-){5}[a-f\d]{2}(?![\w-])/gi;
const EMAIL = /(?<![\w.+-])[\w.+-]+@(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}(?![\w-]|\.[a-z\d-])/gi;
const TOKEN = /(?<![a-z\d_+/-])[a-z\d_+/-]{32,}={0,2}(?![a-z\d_+/-])/gi;
const TOKEN_HINT = /token|key|secret/i;
const EXAMPLE_EMAIL_DOMAINS = new Set(['example.com', 'example.org', 'example.net', 'test']);

// Reasons cannot contain quote delimiters: a marker inside a string must not waive that string's finding.
const ALLOW_COMMENT =
  /(?:\/\/|#|--)\s*guard-private:\s+allow\s+[\p{L}\p{N}][\p{L}\p{N} .,;:/()_-]*\s*$|<!--\s*guard-private:\s+allow\s+[\p{L}\p{N}][\p{L}\p{N} .,;:/()_-]*\s*-->\s*$|\/\*\s*guard-private:\s+allow\s+[\p{L}\p{N}][\p{L}\p{N} .,;:/()_-]*\s*\*\/\s*$/u;

export function parsePrivateWords(source: string): string[] {
  return [
    ...new Set(
      source
        .split(/\r?\n/)
        .map((word) => word.trim())
        .filter((word) => word && !word.startsWith('#')),
    ),
  ];
}

function isPrivateIp(value: string) {
  if (isIP(value) !== 4) return false;
  const [first, second] = value.split('.').map(Number);
  return first === 10 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31);
}

function isPrivateEmail(value: string) {
  const domain = value.slice(value.lastIndexOf('@') + 1).toLowerCase();
  return !EXAMPLE_EMAIL_DOMAINS.has(domain) && !domain.endsWith('.test');
}

function privateWordPattern(word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu');
}

export function scanContent(file: string, content: string | Buffer, privateWords: readonly string[] = []): Finding[] {
  const bytes = typeof content === 'string' ? Buffer.from(content) : content;
  if (bytes.subarray(0, 8192).includes(0)) return [];
  const findings: Finding[] = [];
  const wordPatterns = privateWords.filter((word) => word.trim()).map(privateWordPattern);
  const lines = bytes.toString('utf8').split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    if (ALLOW_COMMENT.test(line)) continue;
    function collect(rule: string, pattern: RegExp, accepts: (value: string, offset: number) => boolean = () => true) {
      for (const match of line.matchAll(pattern)) {
        if (accepts(match[0], match.index))
          findings.push({ file, line: index + 1, rule, masked: `${match[0].slice(0, 2)}***` });
      }
    }
    collect('home-path', HOME_PATH);
    collect('private-ip', IPV4, isPrivateIp);
    collect('lan-hostname', LAN_HOSTNAME);
    collect('mac-address', MAC_ADDRESS);
    collect('email', EMAIL, isPrivateEmail);
    // An integrity checksum may contain "key" by chance; the hint must exist outside the candidate value.
    collect('token', TOKEN, (value, offset) =>
      TOKEN_HINT.test(line.slice(0, offset) + line.slice(offset + value.length)),
    );
    for (const pattern of wordPatterns) collect('private-word', pattern);
  }
  return findings;
}
