import { randomInt, timingSafeEqual } from 'node:crypto';

const CODE_TTL_MS = 120_000;
const MAX_FAILURES = 5;
const WINDOW_MS = 60_000;

export type RedeemResult = 'ok' | 'wrong' | 'limited';

const sameCode = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * The one pairing code that can be redeemed right now, kept in memory: it dies with the process, which is fine for
 * a code that lives two minutes. A wrong guess counts against the caller's address, five in a minute lock it out.
 */
export function createPairingCodes() {
  let active: { code: string; expiresAt: number } | null = null;
  const failures = new Map<string, { count: number; since: number }>();

  /** Replaces any code still active. */
  function create() {
    active = { code: String(randomInt(1_000_000)).padStart(6, '0'), expiresAt: Date.now() + CODE_TTL_MS };
    return { ...active };
  }

  function redeem(address: string, candidate: string): RedeemResult {
    const now = Date.now();
    for (const [key, record] of failures) if (now - record.since >= WINDOW_MS) failures.delete(key);
    const record = failures.get(address);
    // Even the right code is refused while locked out, or the limit would not slow a guesser down.
    if (record && record.count >= MAX_FAILURES) return 'limited';

    if (active && now < active.expiresAt && sameCode(active.code, candidate)) {
      active = null;
      return 'ok';
    }
    failures.set(address, { count: (record?.count ?? 0) + 1, since: record?.since ?? now });
    return 'wrong';
  }

  return { create, redeem };
}

export type PairingCodes = ReturnType<typeof createPairingCodes>;
