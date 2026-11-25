import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import type { IsLoopback } from '../core/auth.ts';
import { z } from 'zod';
import { configSchema, emptyConfig, type Config } from '../core/config.ts';
import { createFakeDesktop, fakeMonitors, fakeStreamSpawn } from './fake-desktop.ts';
import type { createJobRunner } from '../core/jobs.ts';
import { buildServer } from '../server.ts';
import type { Run } from '../core/exec.ts';
import { createFakeCatalog } from './fake-catalog.ts';

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
let jobs: ReturnType<typeof createJobRunner> | undefined;
const systemCalls: string[][] = [];
const player = { gone: false };
const monitors = fakeMonitors();
const catalog = createFakeCatalog();
mkdirSync(join(runDir, 'catalog-local', 'catalog-local'), { recursive: true });

/** YouTube artwork answer from fixtures; anything else goes to the real network as before. */
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
  return fetch(input, init);
}

function build() {
  const stored: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
  const desktop = createFakeDesktop({ system: systemCalls, player, monitors });
  const run: Run = (bin, args, options) => {
    if (bin === 'git') return catalog.run(bin, args, options);
    return desktop(bin, args, options);
  };
  const effectiveConfig = configSchema.parse({ ...config, ...(typeof stored === 'object' ? stored : {}) });
  const app = buildServer({
    dbPath,
    moduleRoots: process.env.HUB_MODULES_ROOT ? [process.env.HUB_MODULES_ROOT] : [],
    deps: {
      run,
      fetch: fakeFetch,
      spawn: (bin, args, line, end) =>
        bin === 'fake-catalog-build' ? catalog.spawn(bin, args, line, end) : fakeStreamSpawn(bin, args, line, end),
      onJobs: (runner) => {
        jobs = runner;
      },
    },
    config: effectiveConfig,
    isLoopback,
    webRoot,
    settings: { configPath, onRestart: catalog.control.manualRestart ? undefined : () => void restart() },
    catalog: {
      reposDir: join(runDir, 'catalog-repos'),
      installedDir: join(runDir, 'catalog-installed'),
      localDir: join(runDir, 'catalog-local'),
      buildCommand: { bin: 'fake-catalog-build', args: [] },
      onRestart: catalog.control.manualRestart ? undefined : () => void restart(),
    },
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
  server.post('/__fake/catalog', (request, reply) => {
    const parsed = z
      .object({
        version: z.enum(['1.0.0', '1.1.0']).optional(),
        failBuild: z.boolean().optional(),
        failSync: z.boolean().optional(),
        manualRestart: z.boolean().optional(),
        hideDemo: z.boolean().optional(),
        missingRequired: z.boolean().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send();
    const changedRestart =
      parsed.data.manualRestart !== undefined && parsed.data.manualRestart !== catalog.control.manualRestart;
    Object.assign(catalog.control, parsed.data);
    if (changedRestart) setTimeout(() => void restart(), 100);
    return catalog.control;
  });
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
}
hooks(app);

await listen();
