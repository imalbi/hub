# E2E (`@hub/e2e`)

Playwright (Chromium only) against a fake server: the real server code with a fake desktop, so nothing touches the real audio, players or config. Run with `pnpm test:e2e` from the root (part of `pnpm verify`); it has no `test` script on purpose, so `pnpm test` and `pnpm check` stay fast.

## How it runs

- `playwright.config.ts` starts two `webServer`s and stops them itself: the fake server (`apps/server/src/fake.ts`, `127.0.0.1:4190`) and Vite (`127.0.0.1:5190`, `--strictPort`, proxying `/trpc` to 4190 through `HUB_PORT`). `reuseExistingServer: false`: a busy port is an error, never a run against `pnpm dev`.
- The fake server allows the origins of this Vite (`http://localhost:5190`, `http://127.0.0.1:5190`) in its fixture config; without them every WebSocket upgrade is refused with 403 and the deck shows "Connessione persa". Change the Vite port in both places or not at all.
- Projects: `setup` runs `pair.setup.ts` first; `deck` (375x812, scale 3, the paired state) runs `deck.spec.ts`, `pairing.spec.ts` and `deck.visual.spec.ts`; `desk` (1920x1080) runs `desk.spec.ts`, `devices.spec.ts` and `desk.visual.spec.ts`.
- **Pairing for real, once per run**: `pair.setup.ts` opens the desk, clicks Genera codice, reads the code, opens a fresh browser context on the deck, types it on the pairing screen, waits for the tiles and saves the state (token in `localStorage`) to `.auth/deck.json` (gitignored, new every run because the fake server starts empty). The `deck` project reuses it through `storageState`; `pairing.spec.ts` and the unpaired visual test start empty with `test.use({ storageState: { cookies: [], origins: [] } })`.
- **PC and phone are two host names for the same machine**: `tests/hosts.ts` has `PC_URL` (`http://localhost:5190`, project `desk`) and `PHONE_URL` (`http://127.0.0.1:5190`, project `deck`). The Vite proxy keeps `Host`, and the fake server (`fake.ts`) trusts only `localhost` as the PC. The `pc` and `phone` fixtures (`tests/fixtures.ts`) are the same two clients over plain HTTP. Keep new specs on the right host or they will meet a 401.
- First run on a machine or after a Playwright update: `pnpm --filter @hub/e2e exec playwright install chromium`.

## Writing specs

- Locate by role and accessible name (`getByRole('button', { name: /^Uscita audio/ })`, `toHaveAccessibleName`): it checks the names AGENTS.md requires. The icon of a tile is the exception, assert its `svg.lucide-*` class.
- The fake desktop is one shared state (default sink, play status) and tests run one at a time (`workers: 1`). A test that changes it puts it back; `deck.spec.ts` also runs `restoreDesktop` (`tests/desktop.ts`) in `afterEach`, so a test that dies halfway does not make the next ones fail. A second client is a plain HTTP call through the `pc` fixture (`playPause(pc)`). A test that pairs a device with `pairDevice(pc, name)` removes it with `revokeDevices(pc, name)` in `finally`. Wrong pairing codes are rate limited per address (5 a minute, and every browser here is `127.0.0.1`): a spec may send a few, not a loop.
- Wait with auto-waiting assertions, not sleeps. The connection-lost state needs a longer `timeout` (the tRPC client backs off between retries).
- A revoked or unknown token ends on the pairing screen (see `pairing.spec.ts`), not on "Connessione persa"; that state is for a dropped socket.
- Dropping the WebSocket: use `controlSockets(page)` (`tests/sockets.ts`, call before `goto`). `page.routeWebSocket` with an instant `ws.close()` does not work: the socket opens first and the tRPC `wsClient` then skips its retry and stays dead. `context.setOffline` leaves open sockets alone.

## Screenshots

- Baselines are committed in `__screenshots__/<project>/<name>.png` (CSS pixel size, no platform suffix: they are made on the owner's Linux machine). The default tolerance is zero, so any pixel change fails.
- The visual specs fulfil `/trpc/health` with a fixed uptime and wait for `document.fonts.ready`. The desk ones also pin `page.clock.setFixedTime`, `devices.list` and `pairing.createCode` (the code is random, the countdown and "last seen" depend on the clock): fix whatever moves, or mask it. Baselines: `deck/deck.png`, `deck/pairing.png`, `desk/desk.png`, `desk/desk-code.png`.
- A failure writes `test-results/` (actual, expected, diff; gitignored). Look at the diff. Update with `pnpm test:e2e:update` only when the visual change is intended, review the new PNGs by eye, and say so in the plan's Progress notes.

## Pomodoro checks

- `pomodoro.spec.ts` runs in the desk project and opens a second authenticated 375x812 deck context. It exercises tile start/pause/resume, running/paused synchronization, desk skip/stop, and a real 6-second focus completion with today's count increasing. afterEach stops any active phase; completed history is intentionally retained.
- `pomodoro-visual.ts` forwards the real fake-server WebSocket and replaces only Pomodoro state for screenshots, so history and wall time cannot leak between specs. Idle and half-completed paused fixtures are explicit; functional specs never pin the subscription.
- Intended baselines now include the third deck tile and desk panel: deck.png, desk.png, desk-code.png; new deck-pomodoro-paused.png, desk-pomodoro-paused.png, desk-4k.png. Pairing.png stays unchanged. Desk is checked at 1920x1080 and 3840x2160; deck at 375x812.
- The idle-ring regression counts bright foreground pixels in a screenshot of the SVG (must be zero). The paused tile's text must stay inside its padding. These checks guard real rendered behavior, not just SVG attributes or source strings.
