import type { Client } from './auth.ts';
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';

type Request = {
  agentId: number;
  name: string;
  action: string;
  input: unknown;
  deviceForbidden?: boolean;
  run: () => Promise<unknown>;
};
type Status =
  | { state: 'pending' | 'running' | 'denied' | 'expired' }
  | { state: 'confirmed'; result: unknown }
  | { state: 'failed'; error: string };
type Entry = Request & { id: string; expiresAt: number; finishedAt?: number; status: Status };

const KEEP_FINISHED_MS = 10 * 60_000;
type Notice = Pick<Entry, 'id' | 'name' | 'action' | 'input' | 'expiresAt'>;

export function createConfirmations(now: () => number = Date.now) {
  const entries = new Map<string, Entry>();
  const listeners = new Set<(items: Notice[]) => void>();
  // Entries hold their `run` closure, so finished ones go after a grace period; `status` answers a gone id as expired.
  const updateExpiry = () => {
    for (const [id, entry] of entries) {
      if (entry.status.state === 'pending' && now() >= entry.expiresAt) entry.status = { state: 'expired' };
      if (entry.status.state === 'pending' || entry.status.state === 'running') continue;
      if (now() >= (entry.finishedAt ?? entry.expiresAt) + KEEP_FINISHED_MS) entries.delete(id);
    }
  };
  const list = () => {
    updateExpiry();
    return [...entries.values()]
      .filter((entry) => entry.status.state === 'pending')
      .map(({ id, name, action, input, expiresAt }) => ({ id, name, action, input, expiresAt }));
  };
  const emit = () => {
    const items = list();
    for (const listener of listeners) listener(items);
  };
  const requirePending = (id: string) => {
    updateExpiry();
    const entry = entries.get(id);
    if (!entry || entry.status.state !== 'pending')
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Confirmation is no longer pending' });
    return entry;
  };
  return {
    subscribe(listener: (items: Notice[]) => void) {
      listeners.add(listener);
      listener(list());
      return () => {
        listeners.delete(listener);
      };
    },
    request(request: Request) {
      if (listeners.size === 0) return null;
      const id = randomUUID();
      entries.set(id, { ...request, id, expiresAt: now() + 120_000, status: { state: 'pending' } });
      for (const delay of [120_000, 120_000 + KEEP_FINISHED_MS]) setTimeout(emit, delay).unref();
      emit();
      return id;
    },
    async confirm(id: string, client: Client) {
      const entry = requirePending(id);
      if (client.kind !== 'loopback' && (client.kind !== 'device' || entry.deviceForbidden))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the PC can approve this action' });
      entry.status = { state: 'running' };
      emit();
      try {
        entry.status = { state: 'confirmed', result: await entry.run() };
      } catch (error) {
        entry.status = { state: 'failed', error: error instanceof Error ? error.message : 'Action failed' };
      }
      entry.finishedAt = now();
      emit();
    },
    deny(id: string) {
      const entry = requirePending(id);
      entry.status = { state: 'denied' };
      entry.finishedAt = now();
      emit();
    },
    status(id: string, agentId: number) {
      updateExpiry();
      const entry = entries.get(id);
      if (!entry) return { state: 'expired' } satisfies Status;
      if (entry.agentId !== agentId) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such confirmation' });
      return entry.status;
    },
  };
}
