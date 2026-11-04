import { useQuery } from '@tanstack/react-query';
import { m } from './paraglide/messages.js';
import { useTRPC } from './trpc.ts';

export function ServerStatus() {
  const trpc = useTRPC();
  const health = useQuery(trpc.health.queryOptions());

  if (health.data) return m.server_up({ seconds: health.data.uptime });
  if (health.error) return m.server_unreachable();
  return m.server_connecting();
}
