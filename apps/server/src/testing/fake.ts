import { EventEmitter } from 'node:events';
import { copyFileSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { IsLoopback } from '../core/auth.ts';
import { z } from 'zod';
import { configSchema, emptyConfig, type Config } from '../core/config.ts';
import { hueStateSchema } from '../integrations/hue/contracts.ts';
import { createFakeDesktop } from './fake-desktop.ts';
import { getFakeHue } from './fake-hue.ts';
import { buildServer } from '../server.ts';
import type { Run } from '../core/exec.ts';

// Fixtures live in the run's own folder (`apps/e2e/tests/hosts.ts` makes one per run), so two runs never share a file.
const runDir = process.env.HUB_E2E_TMP ?? tmpdir();
const webPort = process.env.HUB_E2E_WEB_PORT ?? '5190';

// A copy of the fixture scheme, so e2e can rewrite it to check that the Caelestia theme follows live.
// `apps/e2e/tests/themes.ts` writes the same path.
const caelestiaScheme = join(runDir, 'hub-e2e-caelestia-scheme.json');
copyFileSync(new URL('../modules/theme/fixtures/scheme.json', import.meta.url), caelestiaScheme);

// A powerstat directory with fixed readings: the status is dated far ahead so it never goes stale, and today has an
// hour of samples at 150 W from 08:00 (0.15 kWh), so screenshots read the same whenever the suite runs.
const powerstatDir = join(runDir, 'hub-e2e-powerstat');
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
const newsPage = join(runDir, 'hub-e2e-news.html');
copyFileSync(new URL('../modules/news/fixtures/latest.html', import.meta.url), newsPage);
// Its mtime is "last updated" on screen: a fixed one keeps the screenshots stable.
const newsUpdated = new Date(2026, 10, 4, 8, 30);
utimesSync(newsPage, newsUpdated, newsUpdated);

// Labels match the generic descriptions in the pw-dump fixture. The e2e Vite (see apps/e2e) is not a dev origin
// of the real server, so its origins (the run's Vite port) go on the allowlist or every WebSocket upgrade is refused.
const config: Config = {
  ...emptyConfig,
  pomodoro: { ...emptyConfig.pomodoro, focusMinutes: 0.1, shortBreakMinutes: 0.05, longBreakMinutes: 0.1 },
  audio: {
    outputs: [
      { label: 'Cuffie', match: 'USB Headset' },
      { label: 'Casse', match: 'HDMI Monitor' },
    ],
  },
  server: { host: '127.0.0.1', allowedOrigins: [`http://localhost:${webPort}`, `http://127.0.0.1:${webPort}`] },
  theme: { caelestiaScheme },
  system: { powerstatDir },
  news: { page: newsPage, command: 'webdigest' },
  mail: {
    accounts: [
      { account: 'work', label: 'Lavoro' },
      { account: 'personal', label: 'Personale' },
    ],
  },
  airplay: { command: 'airplay' },
};

// The e2e browser runs on this machine, so every request really is loopback. The suite needs one page to play the PC
// (the desk, which makes pairing codes) and another to play a phone (the deck, which must pair), in the same run. The
// Vite proxy keeps the Host header, so the page opened as `localhost` is the PC and the one on `127.0.0.1` is not.
// Only this file passes the option: `index.ts` never does, and `auth.test.ts` pins that the real default trusts 127.0.0.1.
const isLoopback: IsLoopback = ({ headers }) => headers.host?.split(':')[0] === 'localhost';

// Impostazioni writes this file, never the real config. A restart builds the server again from the fixture config plus
// whatever the file holds (top-level keys replace the fixture's), the way the real one reloads `config.local.json`.
const configPath = join(runDir, 'hub-e2e-config.json');
writeFileSync(configPath, '{}\n');
// A file, not memory: the restart keeps paired devices and module data, as the real service does.
const dbPath = join(runDir, 'hub-e2e.db');
// How long the server stays down on a restart, long enough for the page to show it.
const restartDelayMs = Number(process.env.HUB_E2E_RESTART_MS ?? 1500);
let failMail = false;
const mailCalls: string[][] = [];

function build() {
  const musicEvents = new EventEmitter();
  const playlist: string[] = [];
  let position = -1;
  const stored: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
  const desktop = createFakeDesktop({ mail: mailCalls });
  const run: Run = (bin, args, options) => {
    if (failMail && bin === 'himalaya' && args.includes('envelope') && args.includes('25'))
      return Promise.resolve({ stdout: '', stderr: '', code: 1 });
    return desktop(bin, args, options);
  };
  const app = buildServer({
    dbPath,
    music: {
      youtube: {
        async artist() {
          return {
            name: 'Artista',
            banner: 'https://i.ytimg.com/banner',
            songs: [
              {
                id: '00000000000',
                title: 'Brano artista',
                artists: [{ name: 'Artista', id: 'UCabcdefghijklmnopqrstuv' }],
              },
            ],
            albums: [{ title: 'Disco esempio', cover: 'https://i.ytimg.com/album' }],
          };
        },
        async upNext() {
          return [
            {
              id: '00000000001',
              title: 'Brano 2',
              artists: [{ name: 'Artista', id: 'UCabcdefghijklmnopqrstuv' }],
              seconds: 123,
            },
            { id: '00000000002', title: 'Brano 3', artists: [{ name: 'Artista' }], seconds: 123 },
            { id: '00000000003', title: 'Brano 4', artists: [{ name: 'Artista' }], seconds: 123 },
          ];
        },
        async search() {
          return {
            songs: Array.from({ length: 30 }, (_, i) => ({
              id: String(i).padStart(11, '0'),
              title: `Brano ${i + 1}`,
              artists: [{ name: 'Artista', id: 'UCabcdefghijklmnopqrstuv' }],
              seconds: 123,
            })),
            dropped: 0,
          };
        },
      },
      ipc: {
        events: musicEvents,
        async request(command) {
          if (command[0] === 'loadfile' && typeof command[1] === 'string') {
            if (command[2] === 'replace') {
              playlist.splice(0, playlist.length, command[1]);
              position = 0;
            } else playlist.push(command[1]);
          }
          if (command[0] === 'playlist-next' && position + 1 < playlist.length) {
            position++;
            musicEvents.emit('event', { event: 'end-file', reason: 'stop' });
            musicEvents.emit('event', { event: 'start-file' });
          }
          if (command[0] === 'get_property' && command[1] === 'playlist-pos') return position;
          if (command[0] === 'get_property' && command[1] === 'path') return playlist[position];
          return null;
        },
        close() {},
      },
    },
    moduleRoots: process.env.HUB_MODULES_ROOT ? [process.env.HUB_MODULES_ROOT] : [],
    deps: {
      run,
      fetch: async (input, init) =>
        (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).startsWith(
          'https://i.ytimg.com/',
        )
          ? new Response(readFileSync(new URL('./music-art.png', import.meta.url)))
          : fetch(input, init),
    },
    config: configSchema.parse({ ...config, ...(typeof stored === 'object' ? stored : {}) }),
    isLoopback,
    settings: { configPath, onRestart: () => void restart() },
  });
  return app;
}

let app = build();
let restarting: Promise<void> | undefined;
// Close and build again in place instead of exiting: nothing supervises this process.
function restart() {
  restarting ??= (async () => {
    await app.close();
    await sleep(restartDelayMs);
    app = build();
    hooks(app);
    await listen();
    restarting = undefined;
  })();
  return restarting;
}
const listen = () => app.listen({ host: '127.0.0.1', port: Number(process.env.HUB_PORT ?? 4190) });

function hooks(server: typeof app) {
  server.get('/__fake/mail', () => ({ calls: mailCalls }));
  server.post('/__fake/mail', (request, reply) => {
    const body = z.object({ fail: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send();
    failMail = body.data.fail;
    return { fail: failMail };
  });
  // Test hook for the Hue example module's fake light, so a spec can change it the way Echo or a power cut would and
  // read the writes it received. Only this e2e server has it; there is no such route in `index.ts`.
  const hueHook = z.union([z.object({ reset: z.literal(true) }), hueStateSchema.partial()]);
  server.get('/__fake/hue', (_request, reply) => {
    const fake = getFakeHue();
    return fake ? { state: fake.state(), writes: fake.writes, watchers: fake.watchers } : reply.code(404).send();
  });
  server.post('/__fake/hue', (request, reply) => {
    const fake = getFakeHue();
    const body = hueHook.safeParse(request.body);
    if (!fake || !body.success) return reply.code(fake ? 400 : 404).send();
    if ('reset' in body.data) fake.reset();
    else fake.patch(body.data);
    return { state: fake.state() };
  });
}
hooks(app);

await listen();
