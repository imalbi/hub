import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { DECK_STATE, PC_URL, PHONE_URL, SERVER_PORT, SERVER_URL, WEB_PORT } from './tests/hosts.ts';

// Free ports per run (see `tests/hosts.ts`), so the suite never meets `pnpm dev` or another e2e run; `reuseExistingServer:
// false` makes a collision a hard error instead of a test run against the wrong stack.
const examples = process.env.HUB_EXAMPLE_MODULES === '1';
const privateFolder = process.env.HUB_E2E_PRIVATE;
// Example mode loads modules.example through the private-module root, the same path a private module takes
// (a root the web glob never reached once went unnoticed because only the example-only branch was exercised).
const moduleRoot =
  process.env.HUB_MODULES_ROOT ??
  (privateFolder
    ? join(privateFolder, 'root')
    : examples
      ? fileURLToPath(new URL('../../modules.example', import.meta.url))
      : '/tmp/hub-e2e-no-modules');
// The fake server reads HUB_E2E_* from this process's environment (set by `tests/hosts.ts`); the Vite proxy reads HUB_PORT.
const serverEnv = { HUB_PORT: String(SERVER_PORT), HUB_MODULES_ROOT: moduleRoot, HUB_EXAMPLE_MODULES: '0' };
// Vite keeps its optimized-dependency cache per project; two runs whose config differs (module root, example flag) that
// share it keep invalidating each other's, which reloads the page under a test and fails its in-flight requests.
// A cache per variant is shared only by runs with the same config (the public shards), and stays warm between runs.
const variant = createHash('sha1').update(`${moduleRoot}|${examples}`).digest('hex').slice(0, 8);
const viteEnv = {
  ...serverEnv,
  HUB_VITE_CACHE: fileURLToPath(new URL(`../web/node_modules/.vite-e2e/${variant}`, import.meta.url)),
};
const deckViewport = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 3 };

export default defineConfig({
  testDir: './tests',
  // The fake desktop is one shared state: tests that change it put it back, and run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  snapshotPathTemplate: '__screenshots__{/projectName}/{arg}{ext}',
  // Chromium for all: Safari is the deck's real browser, but layout and logic regressions show up here too.
  use: { browserName: 'chromium' },
  projects: [
    // Pairs a deck for real once (desk makes the code, the pairing screen redeems it); the others reuse its token.
    { name: 'setup', testMatch: 'pair.setup.ts' },
    {
      name: 'deck',
      dependencies: ['setup'],
      testMatch: privateFolder || examples ? [] : ['deck.spec.ts', 'pairing.spec.ts', 'deck.visual.spec.ts'],
      use: { baseURL: PHONE_URL, storageState: DECK_STATE, ...deckViewport },
    },
    {
      name: 'desk',
      dependencies: ['setup'],
      testMatch: privateFolder
        ? []
        : examples
          ? [
              'modules.spec.ts',
              'hue.spec.ts',
              'palette.spec.ts',
              'zone-pages.spec.ts',
              'music.spec.ts',
              'settings.spec.ts',
            ]
          : [
              'palette.spec.ts',
              'palette-regressions.spec.ts',
              'palette.visual.spec.ts',
              'zone-pages.spec.ts',
              'modules.spec.ts',
              'hue.spec.ts',
              'desk.spec.ts',
              'devices.spec.ts',
              'mcp.spec.ts',
              'desk.visual.spec.ts',
              'pomodoro.spec.ts',
              'zones.spec.ts',
              'design.spec.ts',
              'themes.spec.ts',
              'widgets.spec.ts',
              'sites.spec.ts',
              'jobs.spec.ts',
              'system.spec.ts',
              'news.spec.ts',
              'mail.spec.ts',
              'music.spec.ts',
              'settings.spec.ts',
              'settings.visual.spec.ts',
            ],
      use: { baseURL: PC_URL, viewport: { width: 1920, height: 1080 } },
    },
    ...(privateFolder
      ? [
          {
            name: 'private',
            dependencies: ['setup'],
            testDir: privateFolder,
            testMatch: '*.spec.ts',
            use: { baseURL: PC_URL, viewport: { width: 1920, height: 1080 } },
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: 'node ../server/src/testing/fake.ts',
      env: serverEnv,
      // The fake answers 401 here (not the PC), which counts as up.
      url: `${SERVER_URL}/trpc/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm --filter @hub/web exec vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      env: viteEnv,
      url: PHONE_URL,
      reuseExistingServer: false,
    },
  ],
});
