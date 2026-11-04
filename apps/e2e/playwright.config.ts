import { defineConfig } from '@playwright/test';
import { DECK_STATE, PC_URL, PHONE_URL, SERVER_PORT, WEB_PORT } from './tests/hosts.ts';

// Ports of their own so the suite never meets `pnpm dev` (4180, 5173); `reuseExistingServer: false` makes a
// collision a hard error instead of a test run against the wrong stack.
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
      testMatch: ['deck.spec.ts', 'pairing.spec.ts', 'deck.visual.spec.ts'],
      use: { baseURL: PHONE_URL, storageState: DECK_STATE, ...deckViewport },
    },
    {
      name: 'desk',
      dependencies: ['setup'],
      testMatch: [
        'desk.spec.ts',
        'devices.spec.ts',
        'desk.visual.spec.ts',
        'pomodoro.spec.ts',
        'zones.spec.ts',
        'design.spec.ts',
      ],
      use: { baseURL: PC_URL, viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: [
    {
      command: 'node ../server/src/fake.ts',
      env: { HUB_PORT: String(SERVER_PORT) },
      // The fake answers 401 here (not the PC), which counts as up.
      url: `http://127.0.0.1:${SERVER_PORT}/trpc/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm --filter @hub/web exec vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      env: { HUB_PORT: String(SERVER_PORT) },
      url: PHONE_URL,
      reuseExistingServer: false,
    },
  ],
});
