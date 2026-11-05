import { createTRPCClient, httpBatchLink, splitLink, wsLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import type { ModuleDefinition } from '../../../server/src/core/module.ts';
import { authLink } from './auth-link.ts';
import { getToken } from './auth.ts';
import { wsClient } from './trpc.ts';

type ModuleRouter<M extends ModuleDefinition> = Extract<ReturnType<M['create']>['router'], AnyRouter>;

/** Type-only module imports infer procedures; transport prefixes paths and shares the authenticated socket. */
export function createModuleClient<M extends ModuleDefinition>(name: M['name']) {
  return createTRPCClient<ModuleRouter<M>>({
    links: [
      authLink,
      () =>
        ({ op, next }) =>
          next({ ...op, path: `${name}.${op.path}` }),
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: wsLink<AnyRouter>({ client: wsClient }),
        false: httpBatchLink<AnyRouter>({
          url: '/trpc',
          headers: () => {
            const token = getToken();
            return token ? { authorization: `Bearer ${token}` } : {};
          },
        }),
      }),
    ],
  });
}
