import type { Config } from './config.ts';
import { createFakeDesktop } from './fake-desktop.ts';
import { buildServer } from './server.ts';

// Labels match the generic descriptions in the pw-dump fixture. The e2e Vite (see apps/e2e) is not a dev origin
// of the real server, so its origins go on the allowlist or every WebSocket upgrade is refused.
const config: Config = {
  audio: {
    outputs: [
      { label: 'Cuffie', match: 'USB Headset' },
      { label: 'Casse', match: 'HDMI Monitor' },
    ],
  },
  server: { allowedOrigins: ['http://localhost:5190', 'http://127.0.0.1:5190'] },
};

// Loopback only and a port of its own, so it never reaches the LAN or collides with `pnpm dev` on 4180.
await buildServer({ dbPath: ':memory:', run: createFakeDesktop(), config }).listen({
  host: '127.0.0.1',
  port: Number(process.env.HUB_PORT ?? 4190),
});
