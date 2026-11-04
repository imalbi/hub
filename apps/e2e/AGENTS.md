# E2E (`@hub/e2e`)

Playwright (Chromium only) against a fake server: the real server code with a fake desktop, so nothing touches the real audio, players or config. Run with `pnpm test:e2e` from the root (part of `pnpm verify`); it has no `test` script on purpose, so `pnpm test` and `pnpm check` stay fast.

## How it runs

- `playwright.config.ts` starts two `webServer`s and stops them itself: the fake server (`apps/server/src/fake.ts`, `127.0.0.1:4190`) and Vite (`127.0.0.1:5190`, `--strictPort`, proxying `/trpc` to 4190 through `HUB_PORT`). `reuseExistingServer: false`: a busy port is an error, never a run against `pnpm dev`.
- The fake server allows the origins of this Vite (`http://localhost:5190`, `http://127.0.0.1:5190`) in its fixture config; without them every WebSocket upgrade is refused with 403 and the deck shows "Connessione persa". Change the Vite port in both places or not at all.
- Projects: `deck` (375x812, scale 3) runs `deck.spec.ts` and `visual.spec.ts`; `desk` (1920x1080) runs `desk.spec.ts` and `visual.spec.ts`. `visual.spec.ts` takes its route and baseline name from the project name.
- First run on a machine or after a Playwright update: `pnpm --filter @hub/e2e exec playwright install chromium`.

## Writing specs

- Locate by role and accessible name (`getByRole('button', { name: /^Uscita audio/ })`, `toHaveAccessibleName`): it checks the names AGENTS.md requires. The icon of a tile is the exception, assert its `svg.lucide-*` class.
- The fake desktop is one shared state (default sink, play status) and tests run one at a time (`workers: 1`). A test that changes it puts it back; `deck.spec.ts` also runs `restoreDesktop` (`tests/desktop.ts`) in `afterEach`, so a test that dies halfway does not make the next ones fail. A second client is a plain HTTP call: `request.post('/trpc/media.playPause', ...)`.
- Wait with auto-waiting assertions, not sleeps. The connection-lost state needs a longer `timeout` (the tRPC client backs off between retries).
- Dropping the WebSocket: use `controlSockets(page)` (`tests/sockets.ts`, call before `goto`). `page.routeWebSocket` with an instant `ws.close()` does not work: the socket opens first and the tRPC `wsClient` then skips its retry and stays dead. `context.setOffline` leaves open sockets alone.

## Screenshots

- Baselines are committed in `__screenshots__/<project>/<name>.png` (CSS pixel size, no platform suffix: they are made on the owner's Linux machine). The default tolerance is zero, so any pixel change fails.
- `visual.spec.ts` fulfils `/trpc/health` with a fixed uptime (the only moving text) and waits for `document.fonts.ready`; do the same for anything new that changes over time, or mask it.
- A failure writes `test-results/` (actual, expected, diff; gitignored). Look at the diff. Update with `pnpm test:e2e:update` only when the visual change is intended, review the new PNGs by eye, and say so in the plan's Progress notes.
