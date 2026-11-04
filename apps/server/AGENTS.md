# Server (`@hub/server`)

Fastify 5 with tRPC 11 mounted at `/trpc`. `src/server.ts` builds the app (`buildServer()`), `src/index.ts` listens, `src/router.ts` holds `appRouter` and exports `type AppRouter` (the package entry point, consumed by the web app for types).

## Node type stripping

The server runs `.ts` files directly with Node 24, so only erasable TypeScript is allowed:

- relative imports carry the `.ts` extension (`./router.ts`);
- type-only imports use `import type` or inline `type` (`verbatimModuleSyntax`);
- no `enum`, `namespace`, parameter properties or decorators (`erasableSyntaxOnly`); use `as const` objects and zod enums instead.

## Patterns

- Procedures take zod schemas as input (`.input(z.object(...))`); never trust a client value without one.
- Procedures live in module sub-routers (see "Action registry"), never as a flat list in `appRouter`.
- Plain functions and factories over classes. Return values, throw `TRPCError` for client-facing failures.
- External commands (`wpctl`, `playerctl`, `hyprctl`, `caelestia`) go through `ctx.run`, never `execFile` directly in a module. Their output is parsed defensively: missing devices and absent players are normal states, not crashes.
- Log with `app.log` / `req.log`, not `console.log`.

## Action registry

The registry is the tRPC router: a module is a sub-router in `src/modules/<module>/router.ts`, mounted under its name in `src/router.ts` (`audio`, `media`). It exposes `state` (query), `onState` (subscription, see "Live state") and one mutation per action.

- Every mutation sets `.meta({ description, danger? })` (`ActionMeta` in `src/trpc.ts`): English, written for an LLM ("Switch the default audio output to the next configured device"). Later steps derive LLM tools and the danger check from it, and `src/router.test.ts` fails if a mutation has no description.
- The context is `{ db, run, config, live }`. `run` (`src/exec.ts`) is `execFile` with an argument array, 3 s default timeout and a 16 MB buffer (`pw-dump` alone is ~350 KB and grows with streams). It resolves `{ stdout, stderr, code }` and never throws: a non-zero exit, a missing binary and a timeout all come back as a code.
- `buildServer({ dbPath, run?, config? })` defaults to the real `run` and an empty config. Tests inject a fake `run` and a literal config, so they never touch the desktop or `config.local.json`.
- Parsing is pure and lives next to the router (`modules/audio/pipewire.ts`, `modules/media/playerctl.ts`): no I/O, zod at the boundary, unknown shapes skipped. Fixtures use generic device names only (`modules/audio/fixtures/pw-dump.json`).
- No UI copy on the server. The only user-facing strings it returns are values from the user's config (output labels); error messages are short English text that the web app replaces with its own copy.
- PipeWire: state from `pw-dump` JSON (sinks are `Audio/Sink` nodes, the default is `default.audio.sink` in the metadata), switch with `wpctl set-default <id>`.
- playerctl: `--format` does not expand `\t`, so `MEDIA_FORMAT` carries real tabs. "No players found" exits non-zero and is `null` state, not an error.

## Live state

Deck tiles update by push, over the tRPC WebSocket (`wsLink` on the client). Polling stays the source of truth on purpose: media keys, the Caelestia popout and Spotify itself change state without going through Hub.

- `createLiveHub(read, intervalMs = 1000)` in `src/live.ts` is one poller shared by all subscribers: it reads only while someone is subscribed, compares the JSON with the last value and emits only on change. Reads never overlap (a tick or `notify()` that arrives mid-read triggers one more read afterwards, so a state read before a mutation finished is never the last word). A throwing `read` ends the subscriptions with that error instead of crashing the poller, but `read` should not throw on expected conditions (`run` never does).
- Each stateful module has `src/modules/<module>/live.ts` with `read<Module>State(run, ...)` (the one function behind both the `state` query and the hub) and `create<Module>Live(...)`. `buildServer` builds one hub per module per server and passes them as `ctx.live`; they are not module-level singletons, so tests with a fake `run` never share state.
- `onState: publicProcedure.subscription(({ ctx, signal }) => ctx.live.x.subscribe(signal))`. Always pass `signal`: the generator parks on `events.on(...)` and `return()` on an async generator that is mid-`await` is queued until the next event, so only the abort signal ends an idle subscription (and stops the timer when the last one leaves). The first yield is the current state, then every change; a new subscriber after an idle period reads fresh state instead of replaying a stale one.
- After a mutation succeeds: `void ctx.live.x.notify()`. It is a no-op without subscribers, so HTTP-level tests that assert the last `run` call (`calls.at(-1)`) are unaffected. The new state is pushed, the mutation does not return it.
- Measured on the real stack: a change made in Spotify reached the tile in 0.6 to 0.7 s (it waits for the next 1 s tick). playerctl lags the real change slightly after a mutation, so the immediate refresh can still read the old status; the next tick corrects it.
- Event sources (`pw-mon`, `playerctl --follow`) are a possible later optimisation, not a requirement.

## Config

`loadConfig()` in `src/config.ts` reads `$HUB_CONFIG`, default `config.local.json` at the repo root (resolved from `import.meta.url`, not the cwd). A missing file is an empty config; an invalid one throws a message naming the file and the field. Personal values (output labels, device name matches) live there, validated by the zod schema; `server.allowedOrigins` (array, default empty) adds page origins to the WebSocket allowlist; `config.example.json` is tracked with fake values and a test checks it parses. `src/index.ts` loads it and passes it to `buildServer`; procedures read `ctx.config`.

`HUB_PORT` moves both the server and the Vite proxy target, so a second dev stack can run next to one that is already on 4180.

## Fake desktop and smoke check

- `src/fake-desktop.ts` (`createFakeDesktop()`) is the one fake `Run`: the `pw-dump` fixture with a default sink that `wpctl set-default <id>` moves, and one track (`Artist` / `Title`) whose status flips on `playerctl play-pause`. Anything else, including an unknown sink id, is answered with a non-zero code and no state change, so it can never reach a real binary (`fake-desktop.test.ts`). Each call makes a new desktop; tests and `fake.ts` share this module, do not write a second fake.
- `src/fake.ts` is the server for the e2e suite: `buildServer` with that fake, an in-memory DB and a fixture config (outputs `Cuffie` and `Casse`, the e2e Vite origins on the allowlist). Loopback, port `HUB_PORT` (default 4190). Never point it at a real config.
- `src/smoke.ts` (`pnpm smoke`): `runSmoke(run)` checks `wpctl --help` lists `set-default` (wpctl has no `--version`), `playerctl --version`, `pw-dump` through `parsePwDump` (needs a sink and a default sink) and `playerctl metadata` through `parseMediaState` ("No players found" is ok). Read-only by test (`smoke.test.ts` lists the commands it runs); the report says ok, missing or unparseable per check and the exit code is non-zero if any is not ok. `run` returns -1 for both a missing binary and a timeout.

## Database: Drizzle v1 + SQLite (`node:sqlite`)

- One local file, no database server: single user, single writer, small data. Postgres would only earn its place if several machines wrote to the same store.
- Path: `$HUB_DB`, default `~/.local/state/hub/hub.db` (outside the repo). WAL mode and foreign keys are set on open.
- `openDb()` in `src/db/index.ts` applies pending migrations synchronously at startup, before the server listens. Tests use `openDb(':memory:')`.
- Schema in `src/db/schema.ts`, explicit snake_case column names (`integer('started_at', ...)`). Timestamps are `integer` with `mode: 'timestamp_ms'`, booleans `integer` with `mode: 'boolean'`.
- Change the schema, then `pnpm --filter @hub/server db:generate` and commit the folder it writes under `drizzle/`. Never edit a migration that has already run; add a new one. `db:studio` opens Drizzle Studio.
- Drizzle is v1 (release candidate, `drizzle-orm@rc`): the `node-sqlite` driver only exists there. Check the installed typings in `node_modules/drizzle-orm/` before trusting 0.x examples from the web. Relational queries use the v2 object syntax (`where: { id: 1 }`), as in the Efebia projects.
- The db reaches procedures through the tRPC context (`ctx.db`), never as a module-level singleton.

## Security invariants

- WebSocket upgrades (tRPC subscriptions, the deck) check `Origin` against an allowlist before the connection is bound: CORS does not cover WebSockets, so any page open in the browser could otherwise drive the desktop through `localhost`. It lives in `src/server.ts`: `verifyClient` (the 2-argument form, the only one that can answer 403) in the `@fastify/websocket` options, with `isAllowedOrigin` from `src/origin.ts`. A missing `Origin` is refused too; a refused upgrade is logged at `warn`. The allowlist is `DEV_ORIGINS` (Vite on 5173, the server on 4180) plus `config.server.allowedOrigins`; trailing slash and case are ignored. Vite on another port (it moves to 5174 when 5173 is taken) is refused until its origin is in the config. HTTP CORS is not configured yet; when it is, it reads the same allowlist.
- `@fastify/websocket` must be registered before the tRPC plugin (which gets `useWSS: true` and `keepAlive`), or the WebSocket route is not recognised.
- Clients other than the loopback desk authenticate with the deck token; the check lives in the tRPC context, not in each procedure.
- Every LLM call (voice assistant, phase 3) goes through one budget/rate-limit gate before hitting the provider, so a stuck button or a loop cannot burn the quota.
- Destructive actions (`danger: true`) are refused unless the request carries an explicit confirmation flag set by hold-to-confirm or a spoken confirmation.

## Tests

`node:test` + `node:assert/strict`, files next to the code as `*.test.ts`. HTTP-level tests use `buildServer().inject(...)`, no real port. Anything that would call a system binary gets its runner injected so tests never touch the real desktop.

- A POST through `inject` needs `content-type: application/json` (and a body such as `{}`), or tRPC answers 415. The tRPC client always sends it.
- `appRouter._def.procedures` is a flat path-to-procedure map at runtime but typed as the nested tree: widen with `Object.entries<unknown>` and a type guard (see `src/router.test.ts`).
- WebSocket tests use a real server on `listen({ port: 0 })` (`const port = Number(new URL(await app.listen(...)).port)`). Node's global `WebSocket` accepts `{ headers: { Origin } }` and sends no `Origin` by default; `src/live-state.test.ts` drives the tRPC wire protocol with it (`{ id, method: 'subscription', params: { path } }`, answers `started` then `data`) against the shared fake desktop; `src/upgrade.test.ts` sends raw upgrades with `node:http` to read the status code. `tsconfig.json` sets `lib: ["es2023"]` on purpose: without it TypeScript pulls in the DOM typings, whose `WebSocket` constructor has no `headers` option. `@types/ws` is not importable from this package, so the `verifyClient` callback is annotated structurally.
- Hub tests use `mock.timers.enable({ apis: ['setInterval'] })` and flush promises with `setImmediate` from `node:timers/promises` (not mocked); end a parked subscription with its `AbortController`, not `return()` (see "Live state").
- Never call a real mutation (`audio.cycleOutput`, `media.playPause`) against the live system to check it: they change the user's audio. Drive them through a server built with `createFakeDesktop()`.
