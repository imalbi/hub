import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server';
import { getToken } from './auth.ts';
import { replaceToken } from './trpc.ts';

/** An UNAUTHORIZED answer to any call (query, mutation or subscription) means the token is gone, revoked or from a reset database: back to the pairing screen. */
export const authLink: TRPCLink<AnyRouter> =
  () =>
  ({ next, op }) =>
    observable((observer) => {
      const subscription = next(op).subscribe({
        next: (result) => observer.next(result),
        error: (error) => {
          if (error.data?.code === 'UNAUTHORIZED' && getToken() !== null) void replaceToken(null);
          observer.error(error);
        },
        complete: () => observer.complete(),
      });
      return () => subscription.unsubscribe();
    });
