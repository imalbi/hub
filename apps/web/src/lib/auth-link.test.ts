import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTRPCUntypedClient, TRPCClientError, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server';
import { createAuthLink } from './auth-link.ts';

function callWithErrorCode(code: string, initialToken: string | null) {
  let token = initialToken;
  let cleared = 0;
  const auth = createAuthLink(
    () => token,
    () => {
      cleared++;
      token = null;
    },
  );
  const failingTerminal: TRPCLink<AnyRouter> = () => () =>
    observable((observer) => {
      observer.error(new TRPCClientError('fail', { result: { error: { data: { code } } } }));
    });
  const client = createTRPCUntypedClient({ links: [auth, failingTerminal] });
  return client.query('assistant.ask').then(
    () => ({ token, cleared, code: undefined as string | undefined }),
    (error: unknown) => ({
      token,
      cleared,
      code: error instanceof TRPCClientError ? String(error.data?.code) : undefined,
    }),
  );
}

void test('authLink keeps device token on FORBIDDEN and clears it on UNAUTHORIZED', async () => {
  const forbidden = await callWithErrorCode('FORBIDDEN', 'device-token');
  assert.deepEqual(forbidden, { token: 'device-token', cleared: 0, code: 'FORBIDDEN' });

  const unauthorized = await callWithErrorCode('UNAUTHORIZED', 'device-token');
  assert.deepEqual(unauthorized, { token: null, cleared: 1, code: 'UNAUTHORIZED' });
});
