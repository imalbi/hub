import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@hub/server';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// Live state is polled until WebSocket subscriptions land (they need the Origin allowlist first).
export const STATE_REFETCH_MS = 2000;
