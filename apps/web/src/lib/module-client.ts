import { createTRPCClient, httpBatchLink, splitLink, wsLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
export type {
  AnyRouter,
  inferRouterOutputs,
  AnyTRPCRootTypes,
  TRPCBuiltRouter,
  TRPCQueryProcedure,
} from '@trpc/server';
import type { ModuleDefinition } from '../../../server/src/core/module.ts';
import { getToken } from './auth.ts';
import { moduleLink } from './module-link.ts';
import { authLink, wsClient } from './trpc.ts';

type ModuleRouter<M extends ModuleDefinition> = Extract<ReturnType<M['create']>['router'], AnyRouter>;

/** Type-only module imports infer procedures; transport prefixes paths and shares the authenticated socket. */
export function createModuleClient<M extends ModuleDefinition>(name: M['name']) {
  return createRouterClient<ModuleRouter<M>>(name);
}

/** The same transport for a module whose router type is named directly (one whose `create` may return an empty router). */
export function createRouterClient<R extends AnyRouter>(name: string) {
  return createTRPCClient<R>({
    links: [
      authLink,
      moduleLink(name),
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
