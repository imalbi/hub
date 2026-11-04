import type { IsLoopback } from './auth.ts';
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
  server: { host: '127.0.0.1', allowedOrigins: ['http://localhost:5190', 'http://127.0.0.1:5190'] },
};

// The e2e browser runs on this machine, so every request really is loopback. The suite needs one page to play the PC
// (the desk, which makes pairing codes) and another to play a phone (the deck, which must pair), in the same run. The
// Vite proxy keeps the Host header, so the page opened as `localhost` is the PC and the one on `127.0.0.1` is not.
// Only this file passes the option: `index.ts` never does, and `auth.test.ts` pins that the real default trusts 127.0.0.1.
const isLoopback: IsLoopback = ({ headers }) => headers.host?.split(':')[0] === 'localhost';

// Loopback only and a port of its own, so it never reaches the LAN or collides with `pnpm dev` on 4180.
await buildServer({ dbPath: ':memory:', run: createFakeDesktop(), config, isLoopback }).listen({
  host: '127.0.0.1',
  port: Number(process.env.HUB_PORT ?? 4190),
});
