import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    // Must run before react() or route generation and code splitting fail silently.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      // Italian only; Paraglide is here to keep copy out of components, not for translation.
      strategy: ['baseLocale'],
    }),
  ],
  // `ws: true` forwards the WebSocket upgrade of the tRPC subscriptions along with the Origin header the server checks.
  server: { proxy: { '/trpc': { target: `http://127.0.0.1:${process.env.HUB_PORT ?? 4180}`, ws: true } } },
});
