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
pnpm test:e2e     # Playwright against the fake server (apps/e2e): public pass in 2 parallel shards, then the example and private passes together; free ports and a temp folder per process
pnpm test:e2e:private [name] # Playwright against private module e2e with fake desktop (already part of test:e2e; this one runs it alone, one module or all)
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

A module is one folder with `server.ts` (`defineModule`, required) and `ui.tsx` (`ModuleUI`, optional): public ones in `apps/server/src/modules/<name>/` listed in `apps/server/src/modules.ts`, private ones in the gitignored `modules.local/`, discovered at startup. A module folder cannot resolve npm packages, so it imports them through the re-exports in `apps/server/src/core/` (`module.ts`, `module-db.ts`, `module-html.ts`). `modules.example/hello/` is the working reference. <!-- guard-private: allow Repository-local module directory -->

**Before writing or changing a module, read `docs/modules.md`**: config, storage and migrations, files, HTML, web zones and sections, discovery points, checks and private e2e.

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

- Read `plans/VISION.md` (the project's purpose and principles) before planning or executing. Work arrives as a plan file in `plans/` (gitignored by `hub`, versioned in its own private repo `hub-plans`). Follow it: do not reopen decisions it records as taken; if one turns out wrong, stop and say so instead of improvising. A step is done only when its acceptance criteria are met. Keep the plan's `## Progress` checklist current as you go (tick + one-line note per item), so another agent can resume from it and `git diff` if the session stops. **Every handoff writes forward:** before calling a step done, append a `## Handoff from step NN` section to the next plan file (create a stub with just that section if the next plan does not exist yet): what now exists that the next step builds on (names, files, context shape), deviations from the plan and why, gotchas found, limits left open. The reviewing session adds its own review notes there too.
- Executors do not use plugin workflows that manage plans, worktrees, commits or reviewers (for example superpowers' executing-plans, subagent-driven-development, using-git-worktrees, finishing-a-development-branch): this file's workflow applies. A worktree would also leave out the ignored `modules.local/`. Skills that only reinforce it, such as test-driven development and systematic debugging, are fine. <!-- guard-private: allow Repository-local module directory -->
- **Keep plans executable.** Before a step, compare its prerequisites and named APIs with the current code/tests and the latest handoffs; record the checked commit, existing work and unresolved conflicts in the plan. Correct stale facts without reopening approved decisions; stop on a decision conflict. At handoff, update `plans/README.md` and the instructions/acceptance in affected future plans too, so an old instruction cannot undo shipped work. Anything a plan leaves to "a later step" or "its own plan" must land in that plan, or in `plans/BACKLOG.md` when the plan does not exist yet; a rewrite of a plan keeps or explicitly drops what earlier plans left to it. Keep historical notes labelled as history; never mark future checks passed from an earlier run.
- Library and system APIs are checked before use, not recalled: Context7 for docs (TanStack, tRPC, Fastify, Tailwind), the installed source in `node_modules` or `/usr` for behaviour, `--help` for CLIs (`wpctl`, `playerctl`, `hyprctl`, `caelestia`).
- **Several developers, three private repos.** `hub` (root), `hub-local` cloned into `modules.local/` and `hub-plans` cloned into `plans/`; setup in `docs/onboarding.md`. Before a step, `git pull --rebase` in all three; if a pull conflicts, stop and ask. <!-- guard-private: allow Repository-local module directory -->
- **Claim before starting.** A step is taken by writing `taken by <name>, <date>` in its row of `plans/README.md` and pushing `hub-plans` at once; a step already claimed by someone else is not started. Steps that edit the same files (every Lavoro source step touches `config.ts` and `server.ts`) never run in parallel, even under different owners.
- Start a step from a clean tree; executors never commit or push; the reviewing session makes one commit per step after review, then pushes the repos it touched (`hub`, `hub-local`, `hub-plans` for plan updates) and clears the claim. Never force-push `main`, never rewrite pushed history. At the end of a step, after `pnpm check` is green, stage everything with `git add -A` and check the staged file list for anything that must not be tracked. The guard runs in the hook; still read the staged list. Details in `plans/README.md`. No `Co-Authored-By` or session trailers.
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
- **The gate:** `pnpm check` while working; `pnpm verify` (check + e2e + web build) before a step is called done. The final build refreshes `apps/web/dist`, served by the installed service, only after all checks pass; this is authorized at step completion and needs no separate rebuild request. It does not restart the backend or apply desktop integration. The pre-commit hook (`.githooks/pre-commit`, set up by the root `prepare` script on `pnpm install`) always runs the staged guard and then `pnpm verify`, so a regression or failed build blocks the commit; a green verify ends by stamping the tree it tested (`scripts/verify-stamp.ts`, stored in the git dir), and the hook skips the full gate only when the index is exactly that tree (a commit right after the executor's or reviewer's verify) or when every staged path, old names of renames included, ends in `.md` (then it runs the guard and Prettier on them). Anything else, even one changed file, runs it in full. The stamp does not see dependency or system changes outside the tree: after `pnpm install` or a system update, run `pnpm verify` again before committing; `--no-verify` only with the user's explicit OK.
- **Parallel e2e, and what it asks of specs:** `pnpm test:e2e` runs at most 2 Playwright processes at once, each with its own fake desktop, free ports and temp folder (`apps/e2e/tests/hosts.ts`, details in `apps/e2e/AGENTS.md`). Never hardcode a port or a `/tmp/hub-e2e-*` path in a spec or the fake server; import the constants. Two sessions can run e2e at the same time. Do not run more than 2 processes at once on this machine without the owner's OK. `pnpm test:e2e:update` stays serial.
- **One full gate per step.** `pnpm verify` runs once, after the review and its fixes, with no edits while it runs. Before it: targeted specs while working (`pnpm --filter @hub/e2e e2e <file>.spec.ts`), then `pnpm check` (about 15 s). A failing verify that `pnpm check` would have caught, or one run before the review, is wasted time (step 12 spent four full runs).
- **Wait for long commands, do not poll them.** Run `pnpm verify`, `pnpm test:e2e` and `pnpm check` in the foreground with a long timeout, or start them with a high `yield_time_ms` (e.g. 300000) and wait once. Never poll a background process or `tail` its log in a loop: every check resends the whole context (step 22 spent about 40% of its tokens polling).
- **Private-data guard:** manual guard/check/verify scan every tracked worktree file; the pre-commit hook exports `HUB_GUARD_STAGED=1` so the same guard reads only staged blobs, including partially staged files. `HUB_GUARD_STAGED=1 pnpm guard --staged` selects that mode explicitly for both scanners: the root script chains two commands, so a trailing argument alone reaches only the second. Binary detection checks the first 8 KiB; leaf symlinks are scanned as link text and symlinked parent directories are refused before opening a file. Accidentally tracked config/secret files fail without opening their contents. Deliberate generic matches need a trailing `//`, `#`, `--`, HTML or CSS `/* */` comment `guard-private: allow <reason>` on the same line; use documentation IP ranges in fixtures. Guard failures report masked matches, not source lines. This heuristic does not inspect image contents or rewrite history.
- **System drift:** `pnpm smoke` (`apps/server/src/smoke.ts`) runs only read-only commands on the real machine, feeds them through the real parsers and exits non-zero when a binary is missing or its output no longer parses. It is not part of `pnpm verify`. Run it after system updates and whenever a module that wraps a system tool changes; a new wrapped tool gets a check there.

## Keeping these files current

`AGENTS.md` is the single source of rules for every agent (Claude Code, Codex, opencode, Antigravity); each `CLAUDE.md` only imports it with `@AGENTS.md`. Edit `AGENTS.md`, never the `CLAUDE.md` stubs.

When work introduces or reveals a non-obvious pattern, invariant, gotcha or decision, update the relevant AGENTS.md before ending the task, without asking. Terse bullets with file paths and the why; delete entries that become wrong. Put a note in the nested file of the app it concerns (`apps/server/AGENTS.md`, `apps/web/AGENTS.md`); this root file holds only cross-cutting rules. Do not duplicate what git log or the code already says.
