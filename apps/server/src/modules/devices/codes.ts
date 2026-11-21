import { randomInt, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

const CODE_TTL_MS = 120_000;
const MAX_FAILURES = 5;
const MAX_CODE_ATTEMPTS = 10;
const WINDOW_MS = 60_000;

export type RedeemResult = 'ok' | 'wrong' | 'limited';

const sameCode = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function parseIpv6Segment(segment: string): number[] {
  if (!segment) return [];
  const words: number[] = [];
  for (const part of segment.split(':')) {
    if (part.includes('.')) {
      const octets = part.split('.').map(Number);
      words.push(((octets[0] ?? 0) << 8) | (octets[1] ?? 0));
      words.push(((octets[2] ?? 0) << 8) | (octets[3] ?? 0));
    } else words.push(Number.parseInt(part, 16));
  }
  return words;
}

/** Buckets IPv4-mapped IPv6 to canonical IPv4 and regular IPv6 addresses to their /64 prefix. */
export function bucketAddress(address: string) {
  const zone = address.indexOf('%');
  const clean = (zone === -1 ? address : address.slice(0, zone)).trim();
  const version = isIP(clean);
  if (version === 4) return clean;
  if (version !== 6) return address;
  const doubleColon = clean.indexOf('::');
  let words: number[];
  if (doubleColon !== -1) {
    const left = parseIpv6Segment(clean.slice(0, doubleColon));
    const right = parseIpv6Segment(clean.slice(doubleColon + 2));
    words = [...left, ...Array<number>(Math.max(0, 8 - left.length - right.length)).fill(0), ...right];
  } else {
    words = parseIpv6Segment(clean);
  }
  if (words.length === 8 && words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    const hi = words[6] ?? 0;
    const lo = words[7] ?? 0;
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return `${words
    .slice(0, 4)
    .map((word) => word.toString(16))
    .join(':')}::/64`;
}

/**
 * The one pairing code that can be redeemed right now, kept in memory: it dies with the process, which is fine for
 * a code that lives two minutes. Wrong guesses lock out an IPv4 address / IPv6 /64 after 5 attempts and burn the code after 10.
 */
export function createPairingCodes() {
  let active: { code: string; expiresAt: number; attempts: number } | null = null;
  const failures = new Map<string, { count: number; since: number }>();

  /** Replaces any code still active. */
  function create() {
    active = {
      code: String(randomInt(1_000_000)).padStart(6, '0'),
      expiresAt: Date.now() + CODE_TTL_MS,
      attempts: 0,
    };
    return { code: active.code, expiresAt: active.expiresAt };
  }

  function redeem(address: string, candidate: string): RedeemResult {
    const now = Date.now();
    for (const [key, record] of failures) if (now - record.since >= WINDOW_MS) failures.delete(key);
    const bucket = bucketAddress(address);
    const record = failures.get(bucket);
    // Even the right code is refused while locked out, or the limit would not slow a guesser down.
    if (record && record.count >= MAX_FAILURES) return 'limited';

    if (active && now < active.expiresAt && sameCode(active.code, candidate)) {
      active = null;
      return 'ok';
    }
    if (active && now < active.expiresAt) {
      active.attempts += 1;
      if (active.attempts >= MAX_CODE_ATTEMPTS) active = null;
    }
    failures.set(bucket, { count: (record?.count ?? 0) + 1, since: record?.since ?? now });
    return 'wrong';
  }

  return { create, redeem };
}

export type PairingCodes = ReturnType<typeof createPairingCodes>;
