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

The registry is the tRPC router: a module is a sub-router in `src/modules/<module>/router.ts`, mounted under its name in `src/router.ts` (`audio`, `media`). It exposes `state` (query) and one mutation per action.

- Every mutation sets `.meta({ description, danger? })` (`ActionMeta` in `src/trpc.ts`): English, written for an LLM ("Switch the default audio output to the next configured device"). Later steps derive LLM tools and the danger check from it, and `src/router.test.ts` fails if a mutation has no description.
- The context is `{ db, run, config }`. `run` (`src/exec.ts`) is `execFile` with an argument array, 3 s default timeout and a 16 MB buffer (`pw-dump` alone is ~350 KB and grows with streams). It resolves `{ stdout, stderr, code }` and never throws: a non-zero exit, a missing binary and a timeout all come back as a code.
- `buildServer({ dbPath, run?, config? })` defaults to the real `run` and an empty config. Tests inject a fake `run` and a literal config, so they never touch the desktop or `config.local.json`.
- Parsing is pure and lives next to the router (`modules/audio/pipewire.ts`, `modules/media/playerctl.ts`): no I/O, zod at the boundary, unknown shapes skipped. Fixtures use generic device names only (`modules/audio/fixtures/pw-dump.json`).
- No UI copy on the server. The only user-facing strings it returns are values from the user's config (output labels); error messages are short English text that the web app replaces with its own copy.
- PipeWire: state from `pw-dump` JSON (sinks are `Audio/Sink` nodes, the default is `default.audio.sink` in the metadata), switch with `wpctl set-default <id>`.
- playerctl: `--format` does not expand `\t`, so `MEDIA_FORMAT` carries real tabs. "No players found" exits non-zero and is `null` state, not an error.

## Config

`loadConfig()` in `src/config.ts` reads `$HUB_CONFIG`, default `config.local.json` at the repo root (resolved from `import.meta.url`, not the cwd). A missing file is an empty config; an invalid one throws a message naming the file and the field. Personal values (output labels, device name matches) live there, validated by the zod schema; `config.example.json` is tracked with fake values and a test checks it parses. `src/index.ts` loads it and passes it to `buildServer`; procedures read `ctx.config`.

`HUB_PORT` moves both the server and the Vite proxy target, so a second dev stack can run next to one that is already on 4180.

## Database: Drizzle v1 + SQLite (`node:sqlite`)

- One local file, no database server: single user, single writer, small data. Postgres would only earn its place if several machines wrote to the same store.
- Path: `$HUB_DB`, default `~/.local/state/hub/hub.db` (outside the repo). WAL mode and foreign keys are set on open.
- `openDb()` in `src/db/index.ts` applies pending migrations synchronously at startup, before the server listens. Tests use `openDb(':memory:')`.
- Schema in `src/db/schema.ts`, explicit snake_case column names (`integer('started_at', ...)`). Timestamps are `integer` with `mode: 'timestamp_ms'`, booleans `integer` with `mode: 'boolean'`.
- Change the schema, then `pnpm --filter @hub/server db:generate` and commit the folder it writes under `drizzle/`. Never edit a migration that has already run; add a new one. `db:studio` opens Drizzle Studio.
- Drizzle is v1 (release candidate, `drizzle-orm@rc`): the `node-sqlite` driver only exists there. Check the installed typings in `node_modules/drizzle-orm/` before trusting 0.x examples from the web. Relational queries use the v2 object syntax (`where: { id: 1 }`), as in the Efebia projects.
- The db reaches procedures through the tRPC context (`ctx.db`), never as a module-level singleton.

## Security invariants

- WebSocket upgrades (tRPC subscriptions, the deck) must check `Origin` against an allowlist before binding the connection: CORS does not cover WebSockets, so any page open in the browser could otherwise drive the desktop through `localhost`. Same allowlist feeds HTTP CORS.
- Clients other than the loopback desk authenticate with the deck token; the check lives in the tRPC context, not in each procedure.
- Every LLM call (voice assistant, phase 3) goes through one budget/rate-limit gate before hitting the provider, so a stuck button or a loop cannot burn the quota.
- Destructive actions (`danger: true`) are refused unless the request carries an explicit confirmation flag set by hold-to-confirm or a spoken confirmation.

## Tests

`node:test` + `node:assert/strict`, files next to the code as `*.test.ts`. HTTP-level tests use `buildServer().inject(...)`, no real port. Anything that would call a system binary gets its runner injected so tests never touch the real desktop.

- A POST through `inject` needs `content-type: application/json` (and a body such as `{}`), or tRPC answers 415. The tRPC client always sends it.
- `appRouter._def.procedures` is a flat path-to-procedure map at runtime but typed as the nested tree: widen with `Object.entries<unknown>` and a type guard (see `src/router.test.ts`).
- Never call a real mutation (`audio.cycleOutput`, `media.playPause`) against the live system to check it: they change the user's audio. Drive them through a server built with a fake `run`.
