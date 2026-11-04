import { defineConfig } from '@playwright/test';

// Ports of their own so the suite never meets `pnpm dev` (4180, 5173); `reuseExistingServer: false` makes a
// collision a hard error instead of a test run against the wrong stack.
const SERVER_PORT = 4190;
const WEB_PORT = 5190;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testDir: './tests',
  // The fake desktop is one shared state: tests that change it put it back, and run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  snapshotPathTemplate: '__screenshots__{/projectName}/{arg}{ext}',
  use: { baseURL: WEB_URL },
  projects: [
    // Chromium for both: Safari is the deck's real browser, but layout and logic regressions show up here too.
    {
      name: 'deck',
      testMatch: ['deck.spec.ts', 'visual.spec.ts'],
      use: { browserName: 'chromium', viewport: { width: 375, height: 812 }, deviceScaleFactor: 3 },
    },
    {
      name: 'desk',
      testMatch: ['desk.spec.ts', 'visual.spec.ts'],
      use: { browserName: 'chromium', viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: [
    {
      command: 'node ../server/src/fake.ts',
      env: { HUB_PORT: String(SERVER_PORT) },
      url: `http://127.0.0.1:${SERVER_PORT}/trpc/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm --filter @hub/web exec vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      env: { HUB_PORT: String(SERVER_PORT) },
      url: WEB_URL,
      reuseExistingServer: false,
    },
  ],
});
