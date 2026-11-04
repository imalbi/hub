# AGENTS.md

Hub is a personal control center: one Fastify server on the desktop (CachyOS, Hyprland + Caelestia) exposes a registry of actions to two React clients, `/desk` (dashboard in the `special:hub` workspace) and `/deck` (Stream Deck style PWA on an iPhone X, Safari iOS 16.7). Design doc: https://claude.ai/artifact/EoUAnyrHmvFALAseJp25Cy

## Commands

```bash
pnpm dev          # server on 127.0.0.1:4180 + Vite (proxies /trpc to the server)
pnpm typecheck    # tsc in every workspace
pnpm test         # node:test in apps/server
pnpm lint         # oxlint --type-aware + the design-token guard
pnpm format       # prettier --write (format:check to verify)
pnpm check        # typecheck + lint + format:check + test: run before calling any change done
pnpm --filter @hub/server <script>
pnpm --filter @hub/web <script>
```

Node >= 24, pnpm workspaces, TypeScript 7. Linting is oxlint, not ESLint: typescript-eslint only supports TypeScript up to 6.0, while oxlint's type-aware rules run on `oxlint-tsgolint`, built on the same Go compiler as TypeScript 7. Config in `.oxlintrc.json`; Prettier (with the Tailwind class sorter) in `.prettierrc.json`.

## Layout

- `apps/server` (`@hub/server`): Fastify 5 + tRPC 11 + zod. Runs TypeScript directly with Node type stripping, no build step. See `apps/server/AGENTS.md`.
- `apps/web` (`@hub/web`): React 19 + Vite + TanStack Query + tRPC client + Tailwind v4. See `apps/web/AGENTS.md`.
- End-to-end types: the web app imports `type AppRouter` from `@hub/server`. Never import runtime code from the server into the web app, only types.

## Hard rules

- **Public repo, private life stays out.** The repo is public (showcase, all rights reserved). No home paths, hostnames, IPs, device names, tokens or personal data in tracked files. Personal modules (family, study, mail, client sites) live in the gitignored `modules.local/`; personal values in the gitignored `config.local.json`, with a fake `config.example.json` tracked. If a change needs a personal value, read it from config, never hardcode it.
- **Only registry actions run.** The server never executes arbitrary shell commands, not even when an LLM asks. Every side effect is an action with a zod-validated input. Spawn binaries with an argument array (`execFile`), never a shell string.
- **Never read secrets.** Do not open, cat or print `.env*` or `config.local.json`.
- **Loopback until auth exists.** The server binds `127.0.0.1`. Listening on the LAN requires the deck token check to be in place first.

## Code style

- English for identifiers, files, comments and commit messages. UI copy is Italian only, through Paraglide (see `apps/web/AGENTS.md`).
- No `any` and no `as` assertions unless unavoidable, each one justified by a short comment. Never `as unknown as`: fix the source type, add a type guard or parse with zod.
- No IIFEs; extract a named function.
- No em-dashes and no filler phrasing in UI copy, README or commit messages. No emoji.
- Prefer the platform and what is already installed over a new dependency; ask before adding one that only saves a few lines.
- Comment only the why the code cannot show.

## Workflow

- Read `plans/VISION.md` (the project's purpose and principles) before planning or executing. Work arrives as a plan file in `plans/` (gitignored, never committed). Follow it: do not reopen decisions it records as taken; if one turns out wrong, stop and say so instead of improvising. A step is done only when its acceptance criteria are met. Keep the plan's `## Progress` checklist current as you go (tick + one-line note per item), so another agent can resume from it and `git diff` if the session stops.
- Library and system APIs are checked before use, not recalled: Context7 for docs (TanStack, tRPC, Fastify, Tailwind), the installed source in `node_modules` or `/usr` for behaviour, `--help` for CLIs (`wpctl`, `playerctl`, `hyprctl`, `caelestia`).
- Git is local only. Start a step from a clean tree; executors never commit or push; the reviewing session makes one local commit per step after review. At the end of a step, after `pnpm check` is green, stage everything with `git add -A` and check the staged file list for anything that must not be tracked. Details in `plans/README.md`. No `Co-Authored-By` or session trailers.
- UI changes are not done until checked in a real browser (desk at 4K, deck at iPhone X size, 375x812).
- Design references for this project are in `~/swipefile_0.1/refs.json`, entries with `project: "hub"`; read each `note` before using it.

## Keeping these files current

`AGENTS.md` is the single source of rules for every agent (Claude Code, Codex, opencode, Antigravity); each `CLAUDE.md` only imports it with `@AGENTS.md`. Edit `AGENTS.md`, never the `CLAUDE.md` stubs.

When work introduces or reveals a non-obvious pattern, invariant, gotcha or decision, update the relevant AGENTS.md before ending the task, without asking. Terse bullets with file paths and the why; delete entries that become wrong. Put a note in the nested file of the app it concerns (`apps/server/AGENTS.md`, `apps/web/AGENTS.md`); this root file holds only cross-cutting rules. Do not duplicate what git log or the code already says.
