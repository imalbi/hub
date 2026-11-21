import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink, httpLink, splitLink, wsLink } from '@trpc/client';
import type { AppRouter } from '@hub/server';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getToken } from './lib/auth.ts';
import { routeTree } from './routeTree.gen.ts';
import { TRPCProvider, authLink, wsClient } from './lib/trpc.ts';
import './index.css';

const queryClient = new QueryClient();
const authHeaders = () => {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
};
const trpcClient = createTRPCClient<AppRouter>({
  links: [
    authLink,
    splitLink({
      // Subscriptions need the socket; queries and mutations stay plain HTTP.
      condition: (op) => op.type === 'subscription',
      true: wsLink({ client: wsClient }),
      false: splitLink({
        // The rail and Oggi query alongside health; keep these separate so a test pinning health does not replace their answers.
        condition: (op) => op.path === 'modules.enabled' || op.path === 'weather.state',
        true: httpLink({ url: '/trpc', headers: authHeaders }),
        false: httpBatchLink({ url: '/trpc', headers: authHeaders }),
      }),
    }),
  ],
});
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <RouterProvider router={router} />
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
);
