import { copyFileSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IsLoopback } from '../core/auth.ts';
import { z } from 'zod';
import { emptyConfig, type Config } from '../core/config.ts';
import { hueStateSchema } from '../integrations/hue/contracts.ts';
import { createFakeDesktop } from './fake-desktop.ts';
import { getFakeHue } from './fake-hue.ts';
import { buildServer } from '../server.ts';

// A copy of the fixture scheme in the temp dir, so e2e can rewrite it to check that the Caelestia theme follows live.
// `apps/e2e/tests/themes.ts` writes the same path.
const caelestiaScheme = join(tmpdir(), 'hub-e2e-caelestia-scheme.json');
copyFileSync(new URL('../modules/theme/fixtures/scheme.json', import.meta.url), caelestiaScheme);

// A powerstat directory with fixed readings: the status is dated far ahead so it never goes stale, and today has an
// hour of samples at 150 W from 08:00 (0.15 kWh), so screenshots read the same whenever the suite runs.
const powerstatDir = join(tmpdir(), 'hub-e2e-powerstat');
mkdirSync(powerstatDir, { recursive: true });
writeFileSync(join(powerstatDir, 'status.json'), JSON.stringify({ ts: 4_102_444_800, total_w: 212.4 }));
const today = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const day = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
const samples = Array.from(
  { length: 61 },
  (_, minute) => `${day}T${pad(8 + Math.floor(minute / 60))}:${pad(minute % 60)}:00,150.0`,
);
writeFileSync(join(powerstatDir, 'samples.csv'), ['iso,total_w', ...samples].join('\n'));

// The digest page from the news fixture, under a name of its own; the fake desktop answers `webdigest --no-open`.
const newsPage = join(tmpdir(), 'hub-e2e-news.html');
copyFileSync(new URL('../modules/news/fixtures/latest.html', import.meta.url), newsPage);
// Its mtime is "last updated" on screen: a fixed one keeps the screenshots stable.
const newsUpdated = new Date(2026, 10, 4, 8, 30);
utimesSync(newsPage, newsUpdated, newsUpdated);

// Labels match the generic descriptions in the pw-dump fixture. The e2e Vite (see apps/e2e) is not a dev origin
// of the real server, so its origins go on the allowlist or every WebSocket upgrade is refused.
const config: Config = {
  ...emptyConfig,
  pomodoro: { ...emptyConfig.pomodoro, focusMinutes: 0.1, shortBreakMinutes: 0.05, longBreakMinutes: 0.1 },
  audio: {
    outputs: [
      { label: 'Cuffie', match: 'USB Headset' },
      { label: 'Casse', match: 'HDMI Monitor' },
    ],
  },
  server: { host: '127.0.0.1', allowedOrigins: ['http://localhost:5190', 'http://127.0.0.1:5190'] },
  theme: { caelestiaScheme },
  system: { powerstatDir },
  news: { page: newsPage, command: 'webdigest' },
};

// The e2e browser runs on this machine, so every request really is loopback. The suite needs one page to play the PC
// (the desk, which makes pairing codes) and another to play a phone (the deck, which must pair), in the same run. The
// Vite proxy keeps the Host header, so the page opened as `localhost` is the PC and the one on `127.0.0.1` is not.
// Only this file passes the option: `index.ts` never does, and `auth.test.ts` pins that the real default trusts 127.0.0.1.
const isLoopback: IsLoopback = ({ headers }) => headers.host?.split(':')[0] === 'localhost';

// Loopback only and a port of its own, so it never reaches the LAN or collides with `pnpm dev` on 4180.
const app = buildServer({
  dbPath: ':memory:',
  moduleRoots: process.env.HUB_MODULES_ROOT ? [process.env.HUB_MODULES_ROOT] : [],
  deps: { run: createFakeDesktop() },
  config,
  isLoopback,
});

// Test hook for the Hue example module's fake light, so a spec can change it the way Echo or a power cut would and
// read the writes it received. Only this e2e server has it; there is no such route in `index.ts`.
const hueHook = z.union([z.object({ reset: z.literal(true) }), hueStateSchema.partial()]);
app.get('/__fake/hue', (_request, reply) => {
  const fake = getFakeHue();
  return fake ? { state: fake.state(), writes: fake.writes, watchers: fake.watchers } : reply.code(404).send();
});
app.post('/__fake/hue', (request, reply) => {
  const fake = getFakeHue();
  const body = hueHook.safeParse(request.body);
  if (!fake || !body.success) return reply.code(fake ? 400 : 404).send();
  if ('reset' in body.data) fake.reset();
  else fake.patch(body.data);
  return { state: fake.state() };
});

await app.listen({
  host: '127.0.0.1',
  port: Number(process.env.HUB_PORT ?? 4190),
});
