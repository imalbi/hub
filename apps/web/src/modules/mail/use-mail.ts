import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { createTRPCOptionsProxy, useSubscription, type ofFeatureFlags } from '@trpc/tanstack-react-query';
import type { createMailRouter } from '../../../../server/src/modules/mail/router.ts';
import { createRouterClient } from '../../lib/module-client.ts';

// Named directly: the module's `create` returns an empty router when unconfigured, which would make the type a union.
export type MailRouter = ReturnType<typeof createMailRouter>;
export type MailFilter = NonNullable<inferRouterInputs<MailRouter>['inbox']['filter']>;
export type InboxRow = inferRouterOutputs<MailRouter>['inbox']['rows'][number];
const client = createRouterClient<MailRouter>('mail');

export function useMailTRPC() {
  const queryClient = useQueryClient();
  return createTRPCOptionsProxy<MailRouter, ofFeatureFlags<{ keyPrefix: true }>>({
    client,
    queryClient,
    keyPrefix: 'mail',
  });
}

/** The configured accounts, from the config only (no mail is read); an error means Posta is not configured. */
export function useMailAccounts(enabled = true) {
  const trpc = useMailTRPC();
  return useQuery({ ...trpc.accounts.queryOptions(undefined, { enabled }), retry: false, staleTime: Infinity });
}

export function useMail() {
  const trpc = useMailTRPC();
  return useSubscription(trpc.onState.subscriptionOptions());
}
