import { EventEmitter } from 'node:events';
import { copyFileSync, existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleDbPath, openDatabase } from '../db/index.ts';
import { recordCheck } from '../modules/sites/sites.ts';
import { setTimeout as sleep } from 'node:timers/promises';
import type { IsLoopback } from '../core/auth.ts';
import { z } from 'zod';
import { configSchema, emptyConfig, type Config } from '../core/config.ts';
import { createFakeDesktop, fakeMonitors, fakeStreamSpawn } from './fake-desktop.ts';
import type { createJobRunner } from '../core/jobs.ts';
import { buildServer } from '../server.ts';
import type { Run } from '../core/exec.ts';

// Fixtures live in the run's own folder (`apps/e2e/tests/hosts.ts` makes one per run), so two runs never share a file.
const runDir = process.env.HUB_E2E_TMP ?? tmpdir();
const webPort = process.env.HUB_E2E_WEB_PORT ?? '5190';
const serverPort = process.env.HUB_PORT ?? '4190';
const defaultDist = fileURLToPath(new URL('../../../web/dist', import.meta.url));
const candidateWebRoot = process.env.HUB_E2E_DIST ?? defaultDist;
const webRoot = existsSync(join(candidateWebRoot, 'index.html')) ? candidateWebRoot : undefined;

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

const studyDir = join(runDir, 'study');
mkdirSync(join(studyDir, 'in-arrivo'), { recursive: true });
const studyMaterials = join(studyDir, 'materiali');
mkdirSync(studyMaterials, { recursive: true });
writeFileSync(
  join(studyMaterials, 'dispensa.pdf'),
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000202 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n251\n%%EOF\n',
);

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
  server: {
    host: '127.0.0.1',
    allowedOrigins: [
      `http://localhost:${webPort}`,
      `http://127.0.0.1:${webPort}`,
      `http://localhost:${serverPort}`,
      `http://127.0.0.1:${serverPort}`,
    ],
  },
  theme: { caelestiaScheme },
  system: {
    powerstatDir,
    // The fake desktop answers `fake-monitor-<output>` by flipping that output; DP-2 starts off, as in its fixture.
    monitors: [{ output: 'DP-2', label: 'Monitor verticale', command: 'fake-monitor-DP-2' }],
  },
  news: { page: newsPage, command: 'webdigest' },
  mail: {
    accounts: [
      { account: 'work', label: 'Lavoro' },
      { account: 'personal', label: 'Personale' },
    ],
    archiveMailbox: 'archive',
    notify: true,
  },
  weather: { name: 'Località esempio', latitude: 1, longitude: 2 },
  study: { plansDir: studyDir, materialDirs: [studyMaterials] },
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
let jobs: ReturnType<typeof createJobRunner> | undefined;
const mailCalls: string[][] = [];
const systemCalls: string[][] = [];
const player = { gone: false };
const monitors = fakeMonitors();

/** Open-Meteo and YouTube artwork answer from fixtures; anything else goes to the real network as before. */
async function fakeFetch(input: string | URL | Request, init?: RequestInit) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.endsWith('/api/chat')) {
    const body = z
      .object({ messages: z.array(z.object({ content: z.string() })) })
      .parse(JSON.parse(typeof init?.body === 'string' ? init.body : '{}'));
    const text = body.messages.at(-1)?.content;
    const call =
      text === 'spegni il pc'
        ? { name: 'system_powerOff', arguments: { confirmed: true } }
        : { name: 'audio_setOutput', arguments: { label: 'Cuffie' } };
    return Response.json({ prompt_eval_count: 100, message: { content: '', tool_calls: [{ function: call }] } });
  }
  if (url === 'https://example.com/up') return new Response(null, { status: 200 });
  if (url === 'https://example.com/down') return new Response(null, { status: 503 });
  if (url.startsWith('https://api.open-meteo.com/'))
    return Response.json({
      current: { temperature_2m: 19, weather_code: 3 },
      daily: { temperature_2m_min: [12], temperature_2m_max: [23] },
    });
  if (url.startsWith('https://geocoding-api.open-meteo.com/'))
    return Response.json({
      results: [{ name: 'Località esempio', latitude: 1, longitude: 2, admin1: 'Regione esempio' }],
    });
  if (url.startsWith('https://i.ytimg.com/'))
    return new Response(readFileSync(new URL('./music-art.png', import.meta.url)));
  return fetch(input, init);
}

function build() {
  const musicEvents = new EventEmitter();
  const playlist: string[] = [];
  let position = -1;
  let stopped = false;
  let musicVolume = 100;
  const stored: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
  if (stored && typeof stored === 'object' && 'sites' in stored) {
    const fixtureDb = openDatabase(
      moduleDbPath(dbPath, 'sites'),
      fileURLToPath(new URL('../modules/sites/drizzle', import.meta.url)),
    );
    try {
      const count = fixtureDb.$client.prepare('select count(*) as n from site_days').get();
      if (count?.n === 0) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(12, 0, 0, 0);
        recordCheck(fixtureDb, 'https://example.com/down', {
          at: yesterday.getTime(),
          status: 503,
          latency: 10,
          error: null,
        });
      }
    } finally {
      fixtureDb.$client.close();
    }
  }
  const desktop = createFakeDesktop({ mail: mailCalls, system: systemCalls, player, monitors });
  const run: Run = (bin, args, options) => {
    // The inbox listing and a send both fail, so one hook covers a failed list and a failed send.
    if (
      failMail &&
      bin === 'himalaya' &&
      ((args.includes('envelope') && args.includes('25')) || args.includes('--send'))
    )
      return Promise.resolve({ stdout: '', stderr: '', code: 1 });
    return desktop(bin, args, options);
  };
  const effectiveConfig = configSchema.parse({ ...config, ...(typeof stored === 'object' ? stored : {}) });
  const app = buildServer({
    dbPath,
    music: {
      youtube: {
        async searchPlaylists() {
          return [{ id: 'PLexample', title: 'Playlist pubblica' }];
        },
        async playlist() {
          return {
            title: 'Playlist pubblica',
            songs: [
              { id: '00000000000', title: 'Brano 1', artists: [{ name: 'Artista' }] },
              { id: '00000000001', title: 'Brano 2', artists: [{ name: 'Artista' }] },
            ],
          };
        },
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
        async searchArtists() {
          return [{ id: 'UCabcdefghijklmnopqrstuv', name: 'Artista' }];
        },
        async relatedArtists() {
          return [
            { id: 'UC0000000000000000000001', name: 'Artista simile 1', cover: 'https://i.ytimg.com/similar-1' },
            { id: 'UC0000000000000000000002', name: 'Artista simile 2', cover: 'https://i.ytimg.com/similar-2' },
          ];
        },
        // No network in e2e: a recent song with no stored cover falls back to its video thumbnail.
        async cover(): Promise<string | undefined> {
          return undefined;
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
        async search(query: string) {
          if (query === 'playlist-test')
            return {
              songs: [
                { id: 'playlist001', title: 'Mix 1', artists: [{ name: 'Artista' }] },
                { id: 'playlist002', title: 'Mix 2', artists: [{ name: 'Artista' }] },
              ],
              dropped: 0,
            };
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
          if (command[0] === 'stop') stopped = true;
          if (command[0] === 'loadfile' && typeof command[1] === 'string') {
            stopped = false;
            if (command[2] === 'replace') {
              playlist.splice(0, playlist.length, command[1]);
              position = 0;
            } else playlist.push(command[1]);
          }
          if (command[0] === 'stop' || command[0] === 'playlist-clear') {
            if (command[0] === 'stop' && playlist.length)
              musicEvents.emit('event', { event: 'end-file', reason: 'stop' });
            playlist.splice(0, playlist.length);
            position = -1;
          }
          // mpv answers true once its playlist is empty; before the first song the fake answered null, kept as is.
          if (command[0] === 'get_property' && command[1] === 'idle-active') return stopped || null;
          if (command[0] === 'playlist-next' && position + 1 < playlist.length) {
            position++;
            musicEvents.emit('event', { event: 'end-file', reason: 'stop' });
            musicEvents.emit('event', { event: 'start-file' });
          }
          if (command[0] === 'set_property' && command[1] === 'volume' && typeof command[2] === 'number')
            musicVolume = command[2];
          if (command[0] === 'get_property' && command[1] === 'volume') return musicVolume;
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
      fetch: fakeFetch,
      spawn: fakeStreamSpawn,
      onJobs: (runner) => {
        jobs = runner;
      },
    },
    config: effectiveConfig,
    isLoopback,
    webRoot,
    settings: { configPath, onRestart: () => void restart() },
  });
  app.get('/__fake/core', () => ({
    mcp: effectiveConfig.mcp.enabled,
    mcpClient: effectiveConfig.mcp.client,
    jobs: effectiveConfig.jobs.maxConcurrent,
  }));
  app.post('/__fake/assistant', (request, reply) => {
    const parsed = z.object({ enabled: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send();
    effectiveConfig.assistant.enabled = parsed.data.enabled;
    return { enabled: parsed.data.enabled };
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
const listen = () => app.listen({ host: '127.0.0.1', port: Number(serverPort) });

function hooks(server: typeof app) {
  server.get('/__fake/system', () => ({ calls: systemCalls }));
  server.post('/__fake/jobs', (request) => {
    // `{ clear: true }` empties the finished history, which otherwise carries over between specs of a process.
    if (z.object({ clear: z.literal(true) }).safeParse(request.body).success) {
      jobs?.clearHistory();
      return { cleared: true };
    }
    return { jobId: jobs?.start('fake.job', 'fake-job', []) };
  });
  // No player at all (as when nothing was ever started), or back to the first track: the activity ball follows it.
  server.post('/__fake/player', (request, reply) => {
    const body = z.object({ gone: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send();
    player.gone = body.data.gone;
    return { gone: player.gone };
  });
  // The owner's keyboard shortcut: the monitor changes without Hub being asked, and the poll has to notice.
  server.post('/__fake/monitor', (request, reply) => {
    const body = z.object({ output: z.string(), disabled: z.boolean() }).safeParse(request.body);
    if (!body.success || !(body.data.output in monitors)) return reply.code(400).send();
    monitors[body.data.output] = body.data.disabled;
    return { monitors };
  });
  server.post('/__fake/sites', (request, reply) => {
    const body = z.object({ enabled: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send();
    writeFileSync(
      configPath,
      JSON.stringify(
        body.data.enabled
          ? {
              sites: [
                { name: 'Sito pronto', url: 'https://example.com/up' },
                { name: 'Sito non raggiungibile', url: 'https://example.com/down' },
              ],
            }
          : {},
      ),
    );
    setTimeout(() => void restart(), 50);
    return { ok: true };
  });
  server.get('/__fake/mail', () => ({ calls: mailCalls }));
  server.post('/__fake/mail', (request, reply) => {
    const body = z.object({ fail: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send();
    failMail = body.data.fail;
    return { fail: failMail };
  });
}
hooks(app);

await listen();
