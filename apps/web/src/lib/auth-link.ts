import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server';

/** An UNAUTHORIZED answer to any call (query, mutation or subscription) means the token is gone, revoked or from a reset database: back to the pairing screen. */
export function createAuthLink(
  readToken: () => string | null,
  clearToken: () => void | Promise<void>,
): TRPCLink<AnyRouter> {
  return () =>
    ({ next, op }) =>
      observable((observer) => {
        const subscription = next(op).subscribe({
          next: (result) => observer.next(result),
          error: (error) => {
            if (error.data?.code === 'UNAUTHORIZED' && readToken() !== null) void clearToken();
            observer.error(error);
          },
          complete: () => observer.complete(),
        });
        return () => subscription.unsubscribe();
      });
}
