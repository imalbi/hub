import { Buffer } from 'node:buffer';
import { isIP } from 'node:net';
import { inflateSync } from 'node:zlib';

export type Finding = { file: string; line: number; rule: string; masked: string };

const HOME_PATH =
  /\/(?:home|Users)\/[^/\s"'`<>]+(?:\/|(?=$|[\s"'`<>]))|(?<![A-Za-z0-9])[A-Za-z]:(?:\\|\\\\)Users(?:\\|\\\\)[^\\\s"'`<>]+(?:\\|(?=$|[\s"'`<>]))/g;
const IPV4 = /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?!\w|\.\d)/g;
const IPV6_CANDIDATE = /(?<![:\w.])[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}(?:%[a-z\d._-]+)?(?![:\w.])/gi;
const LAN_HOSTNAME =
  /(?<![\w.-])(?:(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+(?:local|lan|home\.arpa|home|internal|ts\.net|fritz\.box)|fritz\.box)(?![\w-]|\.[a-z\d-])/gi;
const MAC_ADDRESS =
  /(?<![\w:-])(?:[a-f\d]{2}:){5}[a-f\d]{2}(?![\w:])|(?<![\w-])(?:[a-f\d]{2}-){5}[a-f\d]{2}(?![\w-])|(?<![\w])dev_[a-f\d]{2}(?:_[a-f\d]{2}){5}(?![\w])|(?<![\w.])(?:[a-f\d]{4}\.){2}[a-f\d]{4}(?![\w.])/gi;
const EMAIL = /(?<![\w.+-])[\w.+-]+@(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}(?![\w-]|\.[a-z\d-])/gi;
const TOKEN = /(?<![a-z\d_+/-])[a-z\d_+/-]{32,}={0,2}(?![a-z\d_+/-])/gi;
const HINT_FREE_TOKEN =
  /AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?<![\w-])sk-(?:proj-|live-|test-|ant-api\d*-)?[A-Za-z0-9_-]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|(?<![\w:])\d{8,10}:[A-Za-z0-9_-]{35}(?![\w-])|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?<![\w])Bearer\s+[A-Za-z0-9._~+/-]{20,}=*(?![\w-])/g;
const TOKEN_HINT = /token|key|secret|password|passwd|bearer|auth/i;
const PHONE_IT = /(?<![\w+])\+39[\s.-]?3\d{2}[\s.-]?\d{3}[\s.-]?\d{3,4}(?!\d)/g;
const IBAN_IT = /(?<![A-Za-z0-9])IT\d{2}[\s-]?[A-Za-z](?:[\s-]?[A-Za-z0-9]){22}(?![A-Za-z0-9])/g;
const CODICE_FISCALE =
  /(?<![A-Za-z0-9])[A-Za-z]{6}\d{2}[ABCDEHLMPRSTabcdehlmprst]\d{2}[A-Za-z]\d{3}[A-Za-z](?![A-Za-z0-9])/g;
const EXAMPLE_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test',
  'noreply.github.com',
  'users.noreply.github.com',
]);
const PUBLIC_EMAIL_ADDRESSES = new Set(['support@github.com', 'noreply@github.com']);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PNG_TEXT_BYTES = 4 * 1024 * 1024;

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
  return (
    first === 10 ||
    (first === 100 && second !== undefined && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6(value: string) {
  const clean = value.split('%')[0] ?? '';
  if (isIP(clean) !== 6) return false;
  const firstHex = clean.split(':')[0] ?? '';
  if (!/^[0-9a-f]{1,4}$/i.test(firstHex)) return false;
  const firstGroup = Number.parseInt(firstHex, 16);
  // ULA (0xfc00/7) and link-local (0xfe80/10)
  return (firstGroup & 0xfe00) === 0xfc00 || (firstGroup & 0xffc0) === 0xfe80;
}

function isPrivateEmail(value: string) {
  const lower = value.toLowerCase();
  if (PUBLIC_EMAIL_ADDRESSES.has(lower)) return false;
  const domain = lower.slice(lower.lastIndexOf('@') + 1);
  return !EXAMPLE_EMAIL_DOMAINS.has(domain) && !domain.endsWith('.test');
}

function normalizeForWords(input: string): string {
  const decoded = input.replace(/(?:%[0-9a-f]{2})+/gi, (sequence) => {
    try {
      return decodeURIComponent(sequence);
    } catch {
      return sequence;
    }
  });
  return decoded
    .normalize('NFKC')
    .replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, '$1 $2')
    .replace(/([\p{Lu}])([\p{Lu}][\p{Ll}])/gu, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase();
}

function compileWordPatterns(privateWords: readonly string[]) {
  return privateWords
    .map((word) => word.trim())
    .filter(Boolean)
    .map((word) => {
      const normalized = normalizeForWords(word).replace(/\s+/g, ' ').trim();
      const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(' ', '\\s+');
      return {
        compactLength: normalized.replace(/\s+/g, '').length,
        pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu'),
      };
    });
}

function decodePngInflate(compressed: Buffer): string {
  try {
    return inflateSync(compressed, { maxOutputLength: MAX_PNG_TEXT_BYTES }).toString('utf8');
  } catch {
    return '';
  }
}

export function extractPngText(bytes: Buffer): string[] {
  if (bytes.length < PNG_MAGIC.length || !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return [];
  const texts: string[] = [];
  let offset = PNG_MAGIC.length;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) break;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'tEXt') {
      const nul = data.indexOf(0);
      if (nul >= 0)
        texts.push(`${data.subarray(0, nul).toString('latin1')}: ${data.subarray(nul + 1).toString('utf8')}`);
    } else if (type === 'zTXt') {
      const nul = data.indexOf(0);
      if (nul >= 0 && nul + 2 <= data.length && data[nul + 1] === 0) {
        const keyword = data.subarray(0, nul).toString('latin1');
        const inflated = decodePngInflate(data.subarray(nul + 2));
        if (inflated) texts.push(`${keyword}: ${inflated}`);
      }
    } else if (type === 'iTXt') {
      const nul1 = data.indexOf(0);
      if (nul1 >= 0 && nul1 + 3 <= data.length) {
        const keyword = data.subarray(0, nul1).toString('latin1');
        const compressed = data[nul1 + 1] === 1;
        const method = data[nul1 + 2];
        const nul2 = data.indexOf(0, nul1 + 3);
        const nul3 = nul2 >= 0 ? data.indexOf(0, nul2 + 1) : -1;
        if (nul3 >= 0) {
          const payload = data.subarray(nul3 + 1);
          const value = compressed ? (method === 0 ? decodePngInflate(payload) : '') : payload.toString('utf8');
          if (value) texts.push(`${keyword}: ${value}`);
        }
      }
    } else if (type === 'IEND') {
      break;
    }
  }
  return texts;
}

function scanLines(
  file: string,
  lines: readonly string[],
  words: ReturnType<typeof compileWordPatterns>,
  includeFilename: boolean,
): Finding[] {
  const findings: Finding[] = [];
  const lineMatchedWordIndices = new Set<string>();

  if (includeFilename && words.length > 0) {
    const normalizedPath = normalizeForWords(file).replaceAll('/', ' ').replaceAll('-', ' ');
    for (const { pattern } of words) {
      for (const match of normalizedPath.matchAll(pattern)) {
        findings.push({ file, line: 1, rule: 'private-word', masked: `${match[0].slice(0, 2)}***` });
      }
    }
  }

  for (const [index, line] of lines.entries()) {
    const lineNum = index + 1;
    // ALLOW_COMMENT waives built-in heuristics only; it never waives configured private words.
    if (!ALLOW_COMMENT.test(line)) {
      function collect(
        rule: string,
        pattern: RegExp,
        accepts: (value: string, offset: number) => boolean = () => true,
      ) {
        for (const match of line.matchAll(pattern)) {
          if (accepts(match[0], match.index)) {
            findings.push({ file, line: lineNum, rule, masked: `${match[0].slice(0, 2)}***` });
          }
        }
      }
      collect('home-path', HOME_PATH);
      collect('private-ip', IPV4, isPrivateIp);
      collect('private-ip', IPV6_CANDIDATE, isPrivateIpv6);
      collect('lan-hostname', LAN_HOSTNAME);
      collect('mac-address', MAC_ADDRESS);
      collect('email', EMAIL, isPrivateEmail);
      collect('token', HINT_FREE_TOKEN);
      // An integrity checksum may contain "key" by chance; the hint must exist outside the candidate value.
      collect('token', TOKEN, (value, offset) =>
        TOKEN_HINT.test(line.slice(0, offset) + line.slice(offset + value.length)),
      );
      collect('phone', PHONE_IT);
      collect('iban', IBAN_IT, (value) => value.replace(/[\s-]/g, '').length === 27);
      collect('codice-fiscale', CODICE_FISCALE);
    }

    if (words.length > 0) {
      const normalizedLine = normalizeForWords(line);
      for (const [wordIndex, { pattern }] of words.entries()) {
        for (const match of normalizedLine.matchAll(pattern)) {
          lineMatchedWordIndices.add(`${index}:${wordIndex}`);
          findings.push({ file, line: lineNum, rule: 'private-word', masked: `${match[0].slice(0, 2)}***` });
        }
      }
    }
  }

  // Detect private words split across a single line break (or hyphenated wrap) without double-counting single-line hits.
  if (words.length > 0) {
    for (let index = 0; index < lines.length - 1; index++) {
      const first = lines[index] ?? '';
      const second = lines[index + 1] ?? '';
      const spaced = normalizeForWords(`${first.trimEnd()} ${second.trimStart()}`);
      const collapsed = normalizeForWords(`${first.replace(/-\s*$/, '').trimEnd()}${second.trimStart()}`);
      for (const [wordIndex, { compactLength, pattern }] of words.entries()) {
        if (lineMatchedWordIndices.has(`${index}:${wordIndex}`)) continue;
        if (lineMatchedWordIndices.has(`${index + 1}:${wordIndex}`)) continue;
        const hitSpaced = spaced.match(pattern);
        const hitCollapsed = compactLength >= 4 ? collapsed.match(pattern) : null;
        const matched = hitSpaced?.[0] ?? hitCollapsed?.[0];
        if (matched && !normalizeForWords(first).match(pattern) && !normalizeForWords(second).match(pattern)) {
          findings.push({ file, line: index + 1, rule: 'private-word', masked: `${matched.slice(0, 2)}***` });
        }
      }
    }
  }

  return findings;
}

export function scanContent(file: string, content: string | Buffer, privateWords: readonly string[] = []): Finding[] {
  const bytes = typeof content === 'string' ? Buffer.from(content) : content;
  const words = compileWordPatterns(privateWords);

  const pngTexts = extractPngText(bytes);
  if (pngTexts.length > 0) {
    return scanLines(file, pngTexts, words, true);
  }
  if (bytes.subarray(0, 8192).includes(0)) {
    return scanLines(file, [], words, true);
  }

  return scanLines(file, bytes.toString('utf8').split(/\r?\n/), words, true);
}
