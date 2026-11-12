import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';

type Request = { agentId: number; name: string; action: string; input: unknown; run: () => Promise<unknown> };
type Status =
  | { state: 'pending' | 'running' | 'denied' | 'expired' }
  | { state: 'confirmed'; result: unknown }
  | { state: 'failed'; error: string };
type Entry = Request & { id: string; expiresAt: number; status: Status };
type Notice = Pick<Entry, 'id' | 'name' | 'action' | 'input' | 'expiresAt'>;

export function createConfirmations(now: () => number = Date.now) {
  const entries = new Map<string, Entry>();
  const listeners = new Set<(items: Notice[]) => void>();
  const updateExpiry = () => {
    for (const entry of entries.values())
      if (entry.status.state === 'pending' && now() >= entry.expiresAt) entry.status = { state: 'expired' };
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
      const timer = setTimeout(emit, 120_000);
      timer.unref();
      emit();
      return id;
    },
    async confirm(id: string) {
      const entry = requirePending(id);
      entry.status = { state: 'running' };
      emit();
      try {
        entry.status = { state: 'confirmed', result: await entry.run() };
      } catch (error) {
        entry.status = { state: 'failed', error: error instanceof Error ? error.message : 'Action failed' };
      }
      emit();
    },
    deny(id: string) {
      requirePending(id).status = { state: 'denied' };
      emit();
    },
    status(id: string, agentId: number) {
      updateExpiry();
      const entry = entries.get(id);
      if (!entry || entry.agentId !== agentId)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No such confirmation' });
      return entry.status;
    },
  };
}
