# AGENTS.md

Hub is a personal control center: one Fastify server on the desktop (CachyOS, Hyprland + Caelestia) exposes a registry of actions to two React clients, `/desk` (dashboard in the `special:hub` workspace) and `/deck` (Stream Deck style PWA on an iPhone X, Safari iOS 16.7). Design doc: https://claude.ai/artifact/EoUAnyrHmvFALAseJp25Cy

## Commands

```bash
pnpm dev          # server on 127.0.0.1:4180 + Vite (proxies /trpc to the server)
pnpm typecheck    # tsc in every workspace
pnpm test         # node:test in apps/server, deploy and scripts
pnpm guard        # scan tracked files for private data; see staged-mode note below
pnpm lint         # oxlint --type-aware + the design-token guard
pnpm format       # prettier --write (format:check to verify)
pnpm check        # guard + typecheck + private-module checks + lint + format:check + test: fast, run while working
pnpm check:modules [name]  # tests and typecheck of the private modules, all or one: the fast loop for a private module
pnpm verify       # check + e2e + web build: the completion gate also refreshes the served UI
pnpm test:e2e     # Playwright against the fake server (apps/e2e)
pnpm test:e2e:update  # rewrite screenshot baselines: only for an intended visual change
pnpm smoke        # read-only check that the real audio/media tools and notify-send help still parse
pnpm serve        # build the web app, then serve it and the API from the server (no Vite, no watch)
pnpm desktop:install # preview desktop integration; --apply installs, --uninstall previews removal
pnpm --filter @hub/server <script>
pnpm --filter @hub/web <script>
```

Node >= 24, pnpm workspaces, TypeScript 7. Linting is oxlint, not ESLint: typescript-eslint only supports TypeScript up to 6.0, while oxlint's type-aware rules run on `oxlint-tsgolint`, built on the same Go compiler as TypeScript 7. Config in `.oxlintrc.json`; Prettier (with the Tailwind class sorter) in `.prettierrc.json`.

## Layout

- `apps/server` (`@hub/server`): Fastify 5 + tRPC 11 + zod. Runs TypeScript directly with Node type stripping, no build step. See `apps/server/AGENTS.md`.
- `apps/web` (`@hub/web`): React 19 + Vite + TanStack Query + tRPC client + Tailwind v4. See `apps/web/AGENTS.md`.
- `apps/e2e` (`@hub/e2e`): Playwright specs and screenshot baselines against a fake server. See `apps/e2e/AGENTS.md`.
- `deploy/`: desktop templates and installer, no personal values. See `deploy/AGENTS.md`. Deployment TypeScript shares the server's Node typecheck; root `pnpm test` also runs its tests.
- The Hue Bluetooth light is TypeScript only: `apps/server/src/integrations/hue/` (BlueZ through `busctl` and `ctx.run`, with a README for pairing and setup) and `apps/web/src/integrations/hue/`; the module itself is private wiring in `modules.local/hue/`. <!-- guard-private: allow Repository-local module directory -->
- `scripts/`: repository checks, included in the server's Node typecheck and root tests. Its local tsconfig reuses the server's Node typings so oxlint also checks it. `guard-private.ts` reads Git snapshots; `private-scanner.ts` is the pure detector and returns masked findings only.
- End-to-end types: the web app imports `type AppRouter` from `@hub/server`. Never import runtime code from the server into the web app, only types.

## Writing a module

A module is one folder with `server.ts` (required) and `ui.tsx` (optional). Public modules live in `apps/server/src/modules/<name>/` and are listed in `apps/server/src/modules.ts`; private ones are a folder in the gitignored `modules.local/` and are discovered at startup, no tracked file changes. `modules.example/hello/` is the working reference (state, live updates, an action, a file round trip, a widget, a zone page, a section on the Lavoro zone and a deck tile). <!-- guard-private: allow Repository-local module directory -->

- **Server** (`server.ts`): `export default defineModule({ name, config?, zones?, create })` from `apps/server/src/core/module.ts`. That file also exports `z` and `TRPCError`: a module folder cannot resolve `zod` or `@trpc/server`. `create({ db?, run, fetch, log, config })` returns `{ router, close? }`; live hubs and services are built inside it and closed in `close`. `config` is the zod slice: public modules read `config.<name>`, private ones `modules.<name>` in `config.local.json`. Names match `^[a-z][a-z0-9-]{0,39}$`; a name or zone that collides, a bad config or a throwing factory skips that module with a log line (no payload) and the server still starts.
- **Checks**: private modules are outside every workspace, so `scripts/check-modules.ts` covers them (`pnpm check:modules [name]`, and `pnpm check` runs it for all). For each folder of the private root with a `server.ts` it runs every `*.test.ts` under it with `node --test` and typechecks the folder with `scripts/tsconfig.modules.json` (the server's Node settings plus JSX and the web `@/` alias). It prints module names and counts, and the failure output in full only when something fails; an unknown name exits 1 and lists the modules found; with no private root or an empty one it prints that and exits 0, so a fresh clone behaves as before. `HUB_MODULES_ROOT` overrides the root, as for discovery. Prettier and oxlint skip the gitignored folder, so private code is tested and typechecked by the gate, not linted. A test inside a private module imports the engine by relative path (`../../apps/server/src/...`), like its `server.ts`.
- **Storage**: a module that keeps data declares `migrations: fileURLToPath(new URL('./drizzle', import.meta.url))` in `defineModule`, the absolute path of its own Drizzle folder, and `create` gets its own SQLite file as `deps.db`, migrated (WAL, foreign keys) before it runs. The file is `<folder of the core database>/modules/<name>.db`, so `~/.local/state/hub/modules/<name>.db` in real use and in memory when the core database is `:memory:` (tests and the e2e fake write no file). Back the `modules/` folder up with `hub.db`. A discovered module never gets the core database: with no `migrations` its deps have no `db` (the type says so), and `coreDb: true`, which gives the core one to the public modules that need it, is refused in discovery. A migration that throws, a missing or relative folder or a file that cannot be opened skips only that module, with the usual payload-free log line. The database closes with the server, after the module's own `close`. The module keeps `schema.ts`, `drizzle.config.ts` and the generated `drizzle/` in its folder (`modules.example/hello/` is the reference); import `sqliteTable`, `integer`, `eq` and the rest from `apps/server/src/core/module-db.ts`, because a module folder cannot resolve `drizzle-orm` (the same reason `z` comes from `module.ts`). Generate with `pnpm --filter @hub/server exec drizzle-kit generate --config ../../modules.local/<name>/drizzle.config.ts`: the config path is relative to `apps/server`, and `schema` and `out` inside it must be absolute (built from `import.meta.url`) because drizzle-kit resolves them against the working directory, not the config file. Never edit a migration that has run; generate a new one. <!-- guard-private: allow Repository-local module directory -->
- **HTML**: a module that scrapes a page or cleans markup imports `parseHTML` from `apps/server/src/core/module-html.ts` (linkedom, exact version in `@hub/server`), because a module folder cannot resolve `linkedom` (the same reason as `z` and drizzle). `parseHTML(html).document` is typed as a DOM `Document`, so code written against the DOM API is shared with the browser, where `new DOMParser().parseFromString(html, 'text/html')` gives the same shape; linkedom's own `DOMParser` is not re-exported because its type does not assign to `Document`. Pass shared code an inert document, never the page's own.
- **Files**: an action takes `{ fileId }` and reads it with `ctx.files.get/read`; it returns `ctx.files.put(bytes, { name, mime })`. Upload is `POST /files`, download `GET /files/:id`, both behind the same loopback-or-token check as tRPC; ids are opaque and expire after an hour. Never accept a client path.
- **Web** (`ui.tsx`): `export default { name, copy, widgets?, zone?, sections?, deck? } satisfies ModuleUI` (`apps/web/src/lib/module-ui.ts`). Widgets are for Panoramica, the one widget board. `zone: { id, label, icon, page }` adds a rail entry and a page the module lays out (its id is its path, `/desk/<id>`, so never a built-in page's path such as `studio`, `lavoro`, `messaggi` or `settings`: the server refuses the zone (`builtinZones` in `apps/server/src/modules/layout/router.ts`) and the web skips it with a warning); `sections: [{ zone, id, label, component }]` add a tab to any zone page after its own tabs, including the built-in Lavoro (`work`) and Messaggi (`messages`) zones, which exist only while a module gives them a section (see `apps/web/AGENTS.md`). Call the server with `createModuleClient<typeof definition>(name)` and a type-only `import type definition from './server.ts'`: inputs and outputs are inferred from the module's own router. Copy is a plain Italian object in the module (private modules cannot join the tracked Paraglide settings).
- **Discovery points** are the only tracked files that may reach `modules.local/`: `apps/server/src/core/discovery.ts` and `apps/web/src/lib/modules.ts` (through the `@hub-private-modules` Vite alias; it must not start with `/`, or Vite joins it to the project root and never applies the alias). `pnpm guard` fails on any other tracked path into it and checks the folder stays ignored. <!-- guard-private: allow Repository-local module directory -->
- **Private repository**: `modules.local/` may be its own git repository (local, or with a private remote the owner adds; never named in tracked files). The outer repo ignores the whole folder, and discovery tries only folders whose name is a valid module name, so `.git` and tool folders are skipped silently. Commit it in the same review as the public commit, with its own message. <!-- guard-private: allow Repository-local module directory -->
- **Example mode**: `HUB_EXAMPLE_MODULES=1 pnpm dev` loads `modules.example/`. `pnpm test:e2e` runs the suite twice; the second pass loads `modules.example/` through `HUB_MODULES_ROOT`, the same path a private module takes.

Skeleton (`modules.local/<name>/server.ts`): <!-- guard-private: allow Repository-local module directory -->

```ts
import { defineModule, z } from '../../apps/server/src/core/module.ts';
import { protectedProcedure, router } from '../../apps/server/src/core/trpc.ts';

export default defineModule({
  name: 'notes',
  config: z.object({ title: z.string().default('Note') }).default({ title: 'Note' }),
  create({ config }) {
    return {
      router: router({
        state: protectedProcedure.query(() => ({ title: config.title })),
      }),
    };
  },
});
```

## Hard rules

- **Public repo, private life stays out.** The repo is public (showcase, all rights reserved). No home paths, hostnames, IPs, device names, tokens or personal data in tracked files. Personal modules (family, study, mail, client sites) live in the gitignored `modules.local/`; personal values in the gitignored `config.local.json`, with a fake `config.example.json` tracked. If a change needs a personal value, read it from config, never hardcode it. `pnpm guard` enforces built-in patterns and an optional gitignored `.private-words` list; only the owner fills that list. Never open or print it. <!-- guard-private: allow Repository-local module directory -->
- **Only registry actions run.** The server never executes arbitrary shell commands, not even when an LLM asks. Every side effect is an action with a zod-validated input. Spawn binaries with an argument array (`execFile`), never a shell string.
- **Never read secrets.** Do not open, cat or print `.env*` or `config.local.json`.
- **Loopback unless paired.** The server binds `127.0.0.1` by default. `server.host` in the config can open it to the LAN, and then only a PC (loopback) or a paired device token gets past `protectedProcedure` (see "Trust, pairing and the LAN" in `apps/server/AGENTS.md`). Never bind to the LAN or edit the real config yourself: the owner does that.
- **Desktop install is opt-in.** `pnpm desktop:install` never writes or starts services without `--apply`; removal needs `--uninstall --apply`. Only the owner applies on the real desktop. The active Hyprland configuration uses Lua: edit the managed block in `hypr-user.lua`, never the legacy `hypr-user.conf`.

## Code style

- English for identifiers, files, comments and commit messages. UI copy is Italian only, through Paraglide (see `apps/web/AGENTS.md`).
- No `any` and no `as` assertions unless unavoidable, each one justified by a short comment. Never `as unknown as`: fix the source type, add a type guard or parse with zod.
- No IIFEs; extract a named function.
- No em-dashes and no filler phrasing in UI copy, README or commit messages. No emoji.
- Prefer the platform and what is already installed over a new dependency; ask before adding one that only saves a few lines.
- Before writing or vendoring a non-trivial component (an animation primitive, a widget, anything past ~100 lines), list maintained libraries that already do it, with size, maintenance and fit, and let the owner choose: owning it versus a dependency is their call, not the agent's.
- Comment only the why the code cannot show.

## Workflow

- Read `plans/VISION.md` (the project's purpose and principles) before planning or executing. Work arrives as a plan file in `plans/` (gitignored, never committed). Follow it: do not reopen decisions it records as taken; if one turns out wrong, stop and say so instead of improvising. A step is done only when its acceptance criteria are met. Keep the plan's `## Progress` checklist current as you go (tick + one-line note per item), so another agent can resume from it and `git diff` if the session stops. **Every handoff writes forward:** before calling a step done, append a `## Handoff from step NN` section to the next plan file (create a stub with just that section if the next plan does not exist yet): what now exists that the next step builds on (names, files, context shape), deviations from the plan and why, gotchas found, limits left open. The reviewing session adds its own review notes there too.
- Executors do not use plugin workflows that manage plans, worktrees, commits or reviewers (for example superpowers' executing-plans, subagent-driven-development, using-git-worktrees, finishing-a-development-branch): this file's workflow applies. A worktree would also leave out the ignored `modules.local/`. Skills that only reinforce it, such as test-driven development and systematic debugging, are fine. <!-- guard-private: allow Repository-local module directory -->
- **Keep plans executable.** Before a step, compare its prerequisites and named APIs with the current code/tests and the latest handoffs; record the checked commit, existing work and unresolved conflicts in the plan. Correct stale facts without reopening approved decisions; stop on a decision conflict. At handoff, update `plans/README.md` and the instructions/acceptance in affected future plans too, so an old instruction cannot undo shipped work. Keep historical notes labelled as history; never mark future checks passed from an earlier run.
- Library and system APIs are checked before use, not recalled: Context7 for docs (TanStack, tRPC, Fastify, Tailwind), the installed source in `node_modules` or `/usr` for behaviour, `--help` for CLIs (`wpctl`, `playerctl`, `hyprctl`, `caelestia`).
- Git is local only. Start a step from a clean tree; executors never commit or push; the reviewing session makes one local commit per step after review. At the end of a step, after `pnpm check` is green, stage everything with `git add -A` and check the staged file list for anything that must not be tracked. The guard runs in the hook; still read the staged list. Details in `plans/README.md`. No `Co-Authored-By` or session trailers.
- UI changes are not done until checked in a real browser (desk at 4K, deck at iPhone X size, 375x812).
- Design references for this project are in `~/swipefile_0.1/refs.json`, entries with `project: "hub"`; read each `note` before using it.

## Verification and tests

Nothing is done until it is verified, and nothing verified once stays unguarded.

- **Every planned change ships with its checks.** A plan's Acceptance lists the tests to add by behaviour (not "add tests") and the manual or visual checks to make. The executor records in the plan's Progress notes what each check actually showed.
- **Where tests go:**
  - pure logic (parsers, pickers, state reducers) gets unit tests next to the code (`*.test.ts`, `node:test`); the shared VS Code settings (`.vscode/settings.json`) fold each test under its source file in the explorer, so they add no noise. Name a test after the file it covers: `x.test.ts`, or `x-<aspect>.test.ts` for a second suite (`server-live.test.ts` under `server.ts`); a test with no matching file shows loose;
  - server behaviour gets integration tests through `buildServer(...).inject` with a fake `run` and fixture config;
  - UI behaviour and layout get e2e specs and screenshot baselines in `apps/e2e` (Playwright against the fake server, see `apps/e2e/AGENTS.md`). A UI change ships with its spec: assert by role and accessible name, and add or update the baseline only when the look change is intended.
- **Tests never touch the real desktop or personal data.** System commands go through an injected fake; fixtures use generic device names. The only exception is `pnpm smoke`, which is read-only by design.
- **Every bug gets a regression test first**: write the test that fails on the bug, then fix it, and keep the test.
- **Never weaken a test to get green.** Do not delete, skip or loosen a failing test, and do not update screenshot baselines, unless the change in behaviour or look is intended; say which and why in the Progress notes.
- **The gate:** `pnpm check` while working; `pnpm verify` (check + e2e + web build) before a step is called done. The final build refreshes `apps/web/dist`, served by the installed service, only after all checks pass; this is authorized at step completion and needs no separate rebuild request. It does not restart the backend or apply desktop integration. The pre-commit hook (`.githooks/pre-commit`, set up by the root `prepare` script on `pnpm install`) always runs the staged guard and then `pnpm verify`, so a regression or failed build blocks the commit; a green verify ends by stamping the tree it tested (`scripts/verify-stamp.ts`, stored in the git dir), and the hook skips the full gate only when the index is exactly that tree (a commit right after the executor's or reviewer's verify). Anything else, even one changed file, runs it in full. The stamp does not see dependency or system changes outside the tree: after `pnpm install` or a system update, run `pnpm verify` again before committing; `--no-verify` only with the user's explicit OK.
- **One full gate per step.** `pnpm verify` runs once, after the review and its fixes, with no edits while it runs. Before it: targeted specs while working (`pnpm --filter @hub/e2e e2e <file>.spec.ts`), then `pnpm check` (about 15 s). A failing verify that `pnpm check` would have caught, or one run before the review, is wasted time (step 12 spent four full runs).
- **Private-data guard:** manual guard/check/verify scan every tracked worktree file; the pre-commit hook exports `HUB_GUARD_STAGED=1` so the same guard reads only staged blobs, including partially staged files. `HUB_GUARD_STAGED=1 pnpm guard --staged` selects that mode explicitly for both scanners: the root script chains two commands, so a trailing argument alone reaches only the second. Binary detection checks the first 8 KiB; leaf symlinks are scanned as link text and symlinked parent directories are refused before opening a file. Accidentally tracked config/secret files fail without opening their contents. Deliberate generic matches need a trailing `//`, `#`, `--` or HTML comment `guard-private: allow <reason>` on the same line; use documentation IP ranges in fixtures. Guard failures report masked matches, not source lines. This heuristic does not inspect image contents or rewrite history.
- **System drift:** `pnpm smoke` (`apps/server/src/smoke.ts`) runs only read-only commands on the real machine, feeds them through the real parsers and exits non-zero when a binary is missing or its output no longer parses. It is not part of `pnpm verify`. Run it after system updates and whenever a module that wraps a system tool changes; a new wrapped tool gets a check there.

## Keeping these files current

`AGENTS.md` is the single source of rules for every agent (Claude Code, Codex, opencode, Antigravity); each `CLAUDE.md` only imports it with `@AGENTS.md`. Edit `AGENTS.md`, never the `CLAUDE.md` stubs.

When work introduces or reveals a non-obvious pattern, invariant, gotcha or decision, update the relevant AGENTS.md before ending the task, without asking. Terse bullets with file paths and the why; delete entries that become wrong. Put a note in the nested file of the app it concerns (`apps/server/AGENTS.md`, `apps/web/AGENTS.md`); this root file holds only cross-cutting rules. Do not duplicate what git log or the code already says.
