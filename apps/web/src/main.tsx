import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink, splitLink, wsLink } from '@trpc/client';
import type { AppRouter } from '@hub/server';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { authLink } from './auth-link.ts';
import { getToken } from './auth.ts';
import { routeTree } from './routeTree.gen.ts';
import { TRPCProvider, wsClient } from './trpc.ts';
import './index.css';

const queryClient = new QueryClient();
const trpcClient = createTRPCClient<AppRouter>({
  links: [
    authLink,
    splitLink({
      // Subscriptions need the socket; queries and mutations stay plain HTTP.
      condition: (op) => op.type === 'subscription',
      true: wsLink({ client: wsClient }),
      false: httpBatchLink({
        url: '/trpc',
        headers: () => {
          const token = getToken();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
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
