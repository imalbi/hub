# E2E (`@hub/e2e`)

Playwright (Chromium only) against a fake server: the real server code with a fake desktop, so nothing touches the real audio, players or config. Run with `pnpm test:e2e` from the root (part of `pnpm verify`); it has no `test` script on purpose, so `pnpm test` and `pnpm check` stay fast.

## How it runs

- `playwright.config.ts` starts two `webServer`s and stops them itself: the fake server (`apps/server/src/testing/fake.ts`) and Vite (`--strictPort`, proxying `/trpc` to the fake server through `HUB_PORT`). **Every run picks two free ports and a temp folder of its own** in `tests/hosts.ts` (a child process binds two port-0 sockets, reads them, closes them; the result goes into `HUB_E2E_SERVER_PORT`, `HUB_E2E_WEB_PORT`, `HUB_E2E_TMP` for the workers and the servers, and the folder is removed on exit). Import `SERVER_URL`, `PC_URL`, `PHONE_URL`, `RUN_TMP`, `DECK_STATE` from there; never write a port or a `/tmp/hub-e2e-*` path in a spec. `reuseExistingServer: false`: a busy port is an error, never a run against `pnpm dev`.
- The fake server allows the origins of this run's Vite (`HUB_E2E_WEB_PORT`) in its fixture config; without them every WebSocket upgrade is refused with 403 and the deck shows "Connessione persa". Its fixtures (Caelestia scheme, news page, powerstat) are written under `HUB_E2E_TMP`, which `themes.ts` reaches through `RUN_TMP`.
- **Vite keeps one dependency cache per config variant** (`HUB_VITE_CACHE`, `apps/web/node_modules/.vite-e2e/<hash of module root and example flag>`, set only for e2e). Two Vites whose config differs (the example pass and a private pass, which run together in `pnpm test:e2e`) that share `node_modules/.vite` both log "Re-optimizing dependencies because vite config has changed" and the page under test reloads: the example pairing setup then times out after 30 s. `pnpm dev` and `pnpm serve` do not set the variable and keep the default cache.
- Projects: `setup` runs `pair.setup.ts` first; `deck` (375x812, scale 3, the paired state) runs `deck.spec.ts`, `pairing.spec.ts` and `deck.visual.spec.ts`; `desk` (1920x1080) runs the desk functional and visual specs. `playwright.config.ts` explicitly lists each project's specs: register every new file there or it will not run.
- **Pairing for real, once per run**: `pair.setup.ts` opens /desk/devices, clicks Genera codice, reads the code, opens a fresh browser context on the deck, types it on the pairing screen, waits for the tiles and saves the state (token in `localStorage`) to `DECK_STATE` (`deck.json` in the run's temp folder: it belongs to that run's fake server, which starts empty, so two runs must not share it). The `deck` project reuses it through `storageState`; `pairing.spec.ts` and the unpaired visual test start empty with `test.use({ storageState: { cookies: [], origins: [] } })`.
- **PC and phone are two host names for the same machine**: `tests/hosts.ts` has `PC_URL` (`localhost`, project `desk`) and `PHONE_URL` (`127.0.0.1`, project `deck`), both on the run's Vite port. The Vite proxy keeps `Host`, and the fake server (`testing/fake.ts`) trusts only `localhost` as the PC. The `pc` and `phone` fixtures (`tests/fixtures.ts`) are the same two clients over plain HTTP. Keep new specs on the right host or they will meet a 401.
- First run on a machine or after a Playwright update: `pnpm --filter @hub/e2e exec playwright install chromium`.

## Writing specs

- Locate by role and accessible name (`getByRole('button', { name: /^Uscita audio/ })`, `toHaveAccessibleName`): it checks the names AGENTS.md requires. The icon of a tile is the exception, assert its intentional `svg[data-icon="play"]` / `svg[data-icon="pause"]` hook. Phosphor icons use `regular` by default; the Luci bulb uses `data-icon="lightbulb"` with `data-weight="fill"` when on and `regular` when off. Never match SVG path data.
- The fake desktop is one shared state (default sink, play status) per Playwright process, and tests in a process run one at a time (`workers: 1`); parallelism is several processes, each with its own fake desktop (see "Parallel run"). A test that changes it puts it back; `deck.spec.ts` also runs `restoreDesktop` (`tests/desktop.ts`) in `afterEach`, so a test that dies halfway does not make the next ones fail. A second client is a plain HTTP call through the `pc` fixture (`playPause(pc)`). A test that pairs a device with `pairDevice(pc, name)` removes it with `revokeDevices(pc, name)` in `finally`. Wrong pairing codes are rate limited per address (5 a minute, and every browser here is `127.0.0.1`): a spec may send a few, not a loop.
- Wait with auto-waiting assertions, not sleeps. The connection-lost state needs a longer `timeout` (the tRPC client backs off between retries).
- A revoked or unknown token ends on the pairing screen (see `pairing.spec.ts`), not on "Connessione persa"; that state is for a dropped socket.
- Dropping the API WebSocket: use `controlSockets(page)` (`tests/sockets.ts`, call before `goto`). `page.routeWebSocket` with an instant `ws.close()` does not work: the socket opens first and the tRPC `wsClient` then skips its retry and stays dead. `context.setOffline` leaves open sockets alone. The helper must only track/refuse /trpc sockets: closing Vite's HMR socket triggers a full reload and makes the outage test race with navigation. deck.spec.ts asserts the HMR socket remains open.

## Screenshots

- Baselines are committed in `__screenshots__/<project>/<name>.png` (CSS pixel size, no platform suffix: they are made on the owner's Linux machine). The default tolerance is zero, so any pixel change fails.
- The visual specs fulfil `/trpc/health` with a fixed uptime and wait for `document.fonts.ready`. The desk visual specs also pin `page.clock.setFixedTime`, `devices.list` and `pairing.createCode` (the code is random, the countdown and "last seen" depend on the clock): fix whatever moves, or mask it. Baselines: `deck/deck.png`, `deck/pairing.png`, `desk/desk.png`, `desk/desk-code.png`.
- A failure writes `test-results/` (actual, expected, diff; gitignored). Look at the diff. Update with `pnpm test:e2e:update` only when the visual change is intended, review the new PNGs by eye, and say so in the plan's Progress notes.

## Pomodoro checks

- `pomodoro.spec.ts` runs in the desk project and opens a second authenticated 375x812 deck context. It exercises tile start/pause/resume, running/paused synchronization, desk skip/stop, and a real 6-second focus completion with today's count increasing. afterEach stops any active phase; completed history is intentionally retained.
- `pomodoro-visual.ts` forwards the real fake-server WebSocket and replaces only Pomodoro state for screenshots, so history and wall time cannot leak between specs. Idle and half-completed paused fixtures are explicit; functional specs never pin the subscription.
- Intended baselines now include the third deck tile and desk panel: deck.png, desk.png, desk-code.png; new deck-pomodoro-paused.png, desk-pomodoro-paused.png, desk-4k.png. Pairing.png stays unchanged. Desk is checked at 1920x1080 and 3840x2160; deck at 375x812.
- `pomodoro.spec.ts` records every frame's readable time and whether a digit is rolling (`recordTimerFrames`): the first real value must not roll in from 00:00 (paused frozen state, 20 frames after it shows), and a later tick still rolls (real fake-server phase). The roll on load had made the paused baseline bistable once the page rendered before the state arrived; capture with reduced motion only to hide something that is meant to move.
- The idle-ring regression counts bright foreground pixels in a screenshot of the SVG (must be zero). The paused tile's text must stay inside its padding. These checks guard real rendered behavior, not just SVG attributes or source strings.

## Desk zones (step 07)

- Pair setup and devices.spec.ts now open /desk/devices; pomodoro.spec.ts exercises the full panel at /desk/studio. Overview has only compact controls. Keep assertions on their real zone rather than restoring old overview content for a test.
- zones.spec.ts covers exact active links, all six rail destinations (Impostazioni last) and direct Studio load, number shortcuts/editable input/modifiers (the focused-button case uses the palette button: a radio is an input and the handler skips it), saved theme/reload, SPA exit to deck/back (ink then restored paper), the fresh deck retaining its computed ink background, and real fake-server playback/output cycling (restored in finally). A paper hover test computes WCAG contrast for Salta/Ferma; the original ratio was 1:1.
- Desk baselines: desk.png (overview), desk-4k.png, desk-paper.png, desk-studio.png, desk-media.png, desk-system.png, desk-devices.png, desk-settings.png, desk-devices-4k.png, plus desk-code.png in Dispositivi and desk-pomodoro-paused.png in Studio. Every desk baseline includes the resting palette button (07p). The per-zone snapshots use pinned health/device data and frozen Pomodoro subscription state; deck baselines are unchanged.
- The deck now has its own `ThemeProvider`, defaulting to ink and restoring `hub.theme` from that browser's storage (step 08). Assert the rendered background when checking theme isolation, not the absence of a data-theme attribute.

## Desk design pass (step 07b)

- design.spec.ts verifies Media artwork and transport, shared-track restoration, rail movement, theme-dependent backdrop blur, no active player animations under reduced motion, per-button error status, connection badge dimming, the empty device list and the focus activity opening Studio. contrast.ts measures rendered colors in a canvas; both rail-label and Pomodoro hover regressions require 4.5:1.
- NumberRoll adds decorative digit strips to the desk timer. Read the timer's direct `:scope > .sr-only` child for the exact time (step 08 removed the hidden output and the description). Never compare the entire decorative DOM text. Deck text assertions stay unchanged.
- All existing desk baselines intentionally change in 07b; Media in paper adds desk-media-paper.png. Move the pointer away before normal screenshots so the focused/hovered rail label cannot leak into a page baseline; hover readability has its own functional test. Continue freezing uptime, devices, pairing code, clock and Pomodoro; disable animations and await artwork when present.
- The deck baseline files are unchanged by 07b; do not update them for desk work. Only desk images are regenerated during this pass. A global CSS or shared-hook change must still pass the existing deck screenshots in verify.
- Artwork recovery tests return null or another key once, then the valid fake cover; both must recover with one retry. A frozen Pomodoro plus page.clock verifies that visible time changes while a MutationObserver sees no updates to the phase-only polite announcement. These regressions guard against infinite freshness of failures and a screen reader announcing every second.

## Deck pages, hold and clock (step 08)

- The deck has three pages; a test that switches page clears `hub.deck.page` (and `hub.theme`) in `finally`. A swipe is `.deck-pages` `scrollTo`. Tiles on pages off screen are hidden from role queries, so `getByRole('button', { name: /^Pomodoro:/ })` still finds one.
- Holding: hover, `page.mouse.down()`, advance `page.clock`, `mouse.up()`. The mid-hold baseline pauses timers (`clock.pauseAt`) and pins every WAAPI animation at 400 ms. Danger mutations from test helpers pass `confirmed: true`.
- Pomodoro clock checks install `page.clock`: a MutationObserver on the timer's direct `.sr-only` child records each second once; a client an hour ahead still shows the server's time (the offset from `serverNow`). The timer's text is its direct `:scope > .sr-only` child (NumberRoll has its own sr-only nodes). `pomodoro.configure` changes the fake server for later tests: a test that calls it restores the fixture durations in `finally`.
- New baselines: deck-studio.png, deck-system.png, desk-pomodoro-settings.png, hold-button-mid-hold.png.

## Sistema (step 09)

- `system.spec.ts` (desk) and the Sistema test in `deck.spec.ts`: consumption from the fake powerstat dir (212 W, 0,15 kWh oggi), lock and workspace buttons reach success, power off fires only after the hold. The argv of each command is a server test, the fake never runs them.
- Baselines: desk-system.png (Comandi wide, Consumo and Server small), deck-system.png, and the HoldButton height fix (now `min-h-touch`) in desk-devices, desk-code, desk-theme-editor and hold-button-mid-hold; desk-widgets-edit lists the new widgets.

## Notizie (step 10)

- The fake config copies `modules/news/fixtures/latest.html` (22 items) to the temp dir with a fixed mtime (4 Nov 08:30), which is the "Aggiornato" line in the baselines. `news.spec.ts` (desk) and the Notizie test in `deck.spec.ts` check count, badge and that Aggiorna/Apri succeed; argv is a server test.
- Baselines with the Notizie widget or tile: desk, desk-4k, desk-paper, desk-moss, desk-stone, desk-caelestia, desk-widgets-edit, deck, deck-pomodoro-paused.

## Modules (step 11)

- `pnpm test:e2e` runs the public pass and, next to the private pass, a second pass with `HUB_EXAMPLE_MODULES=1` in the test process only: `playwright.config.ts` then points `HUB_MODULES_ROOT` of the fake server and Vite at `modules.example/` and runs only `modules.spec.ts` and the specs listed for it, so the example travels the private-module path (server discovery plus the `@hub-private-modules` glob). The public pass uses an empty root and checks the example is absent.
- Baselines `desk/desk-example-4k.png` and `desk/deck-example.png`; the deck one pins `health` like the other visual specs. Size radios are visually hidden in their labels: click the `label`, never `check()` the radio (it waits forever).

## Hue light (step 11a)

- `hue.spec.ts` runs in the desk project in both passes: with `HUB_EXAMPLE_MODULES=1` it drives the example module's fake light (desk and deck sync both ways, an outside change, Bluetooth lost and back, brightness on release, capabilities), without it only checks the light is absent. It changes the fake through `POST ${SERVER_URL}/__fake/hue` (the run's fake server port) (`apps/server/src/testing/fake.ts`; the Vite proxy forwards only `/trpc`) and `afterEach` posts `{ reset: true }`.
- Every Hue desk test opens `/desk/devices?tab=luci`. Hue specs also check the `Luce: <state>` icon toggle's `aria-pressed`, bulb weights, one write per tap, pending/success/error feedback, and disabled/recovery on Hub socket loss.
- Baselines (all in `desk/`, since the spec runs in the desk project, deck shots included): `desk-lights`, `desk-lights-unavailable`, `desk-lights-power-only`, `desk-lights-paper` (the Luci panel on its own, as a page element), `desk-lights-4k` (the Luci tab of Dispositivi, `/desk/devices?tab=luci`; Panoramica checked to have no Luci by default), `deck-lights`, `deck-lights-unavailable`.

## Command palette (step 12)

- Ports are free ones picked per run, so a manual fake/Vite server can never block a run and a run never needs 4190/5190. Use the registered 4K specs for inspection, and stop servers you started by PID.
- `palette.spec.ts` runs in both passes: Ctrl+K, fuzzy label/English-description filtering, arrows/Enter, Escape/focus return, recent paths, flat schema forms, generic errors and HoldButton-only danger execution. The example pass runs Hue brightness and explicit boolean power through registry discovery; it resets the fake light afterward. Wait for the requested option before pressing Enter: the registry query loads on open. No real desktop command is used.
- `palette.visual.spec.ts` adds only three intentional baselines on a 3840x2160 desk: full palette, generated form and danger confirmation. Existing desk/deck baselines are unchanged.

- `palette-regressions.spec.ts` guards review findings: focus transfers to form/hold, an old slow action cannot close a new form, and layout reset refreshes the visible board without reload. Its layouts are reset in finally.

## Zone pages and the palette entry point (step 07p)

- `zone-pages.spec.ts` runs in both passes: every page has no "Modifica", no `Widget` region and no `[data-widget]` (each waits for a landmark of its page first, so "nothing here" cannot pass on an empty screen); Impostazioni shows Aspetto and a chosen theme applies; the last row of a page stays above the palette button (a 500px-high viewport on Media, scrolled to the end). Example pass only: Dispositivi has the tabs Dispositivi and Luci, a click and Left/End/Home switch them, `?tab=luci` appears for all but the first, history length does not grow, a reload and a deep link keep the tab, `?tab=nope` falls back, and `desk-devices-tabs.png` is the bar. First pass: one tab, no bar, `?tab=luci` changes nothing.
- `modules.spec.ts`: example pass has the example zone as a page, the example widget offered in Panoramica (adding and resizing each save the board, so wait for each save, not one) and Lavoro in the rail with the example section as its only tab; first pass has no Lavoro or Messaggi entry and `/desk/lavoro`, `/desk/messaggi` say "Pagina non trovata".
- `palette.spec.ts` (both passes) adds: the round button at the bottom right of every desk page, the button and Ctrl+K opening the palette at the bottom center with Escape giving focus back to the button, the opening animation (`getAnimations()` on the dialog right after a click is above zero, zero with reduced motion), and the Vai a group (the rail zones in order, above Azioni, navigating). Wait for a visible element (the button) before pressing Ctrl+K: the listener exists only once React has mounted. Cmdk groups render `role="group"` named by their heading, so locate options with `getByRole('group', { name })`.
- Baselines for 07p: `desk-settings`, `desk-devices-4k`, `desk-palette` (1920x1080), `desk-palette-rest-4k`, `desk-devices-tabs` (example pass) and the changed `desk-studio`, `desk-media`, `desk-system`, `desk-devices`, `desk-palette-4k`, the Luci ones above and `desk-example-4k`. Intended: every desk image gained the resting button, the zone pages replaced the boards, and an element screenshot of a page panel no longer has the board cell's fixed height.

- Step 13: deck tests navigate to Scrivania 2 for module tiles. Desk visual captures set reduced motion before load and wait for the media icon to settle: its Web Animations can otherwise race screenshot capture. Media screenshot scrolls to the audio section and asserts the slider and both mute buttons are inside the viewport.

## Private e2e mechanism (step 16g)

- Generic, opt-in mechanism in `playwright.config.ts`: when `HUB_E2E_PRIVATE` env var names a folder, a `private` desk project is registered with specs from that folder's `*.spec.ts` and module root (`HUB_MODULES_ROOT`) at that folder's `root/`.
- Unset, nothing changes: public `deck` and `desk` run as normal.
- No tracked file names the private module root: private specs import public test helpers (`fixtures.ts`, `hosts.ts`) by relative path.
- **No screenshot baselines for private UI**: private specs assert by role, name and state only, so private layout is never captured in tracked baselines.
- Executed via `pnpm test:e2e:private [name]` (runs against discovered private module `e2e/` folders or `HUB_E2E_PRIVATE`). With no private root or no private `e2e/` folders, it prints that and exits 0. `pnpm test:e2e` (and so `pnpm verify`) runs it as part of its second stage, next to the example pass.

## Parallel run (step 18)

- `pnpm test:e2e` is `scripts/test-e2e.ts`, never more than 2 processes at once (`WORKERS`, 3 or 4 only with the owner's OK): stage 1 is the public pass as `--shard=1/2` and `--shard=2/2`, stage 2 is the example pass next to `scripts/test-e2e-private.ts`. A failure in stage 1 stops before stage 2; both processes of a stage always finish so every failure shows. Output lines carry the job label.
- The parallelism is processes, not Playwright workers: each process has its own fake desktop, two free ports, a temp folder and its own pairing (`pair.setup.ts` therefore runs once per process: a sharded pass shows 122 tests plus 2 setups, where the serial pass showed 123 with one). A worker-scoped fixture would have meant rewriting every spec that reads the host constants.
- `--shard` balances groups (here: spec files) by test count, not duration, so the example pass is not sharded (its files split 22/11 and the pass got no shorter than running it next to the private pass).
- Specs never see each other's state across processes. They still must not depend on the order of files inside a process.
- `Unable to transform response from server` in the private run's log is expected: `optimistic rollback on forced mutation failure` fulfils a 500 with a body tRPC cannot parse on purpose. It is not a sign of a failing run (it also appears in a green serial run).
- `--repeat-each` reuses one fake server, so a spec that changes server state is not idempotent under it (the lavoro undo spec passed 3 times and then failed 17 times for that reason); to repeat such a spec, start a process per run.
- `pnpm test:e2e:update` stays serial: baselines are rewritten from one process.
- The first failure artifacts live in `test-results/`, which every Playwright process empties at its start: two runs started at once keep only what the later start leaves.
