# Onboarding a second developer

Hub lives in three private GitHub repositories. Ask the owner for access to all three first.

- `hub`, the root: server, web app, e2e, deploy templates, rules (`AGENTS.md`).
- `hub-local`, cloned into `modules.local/`: private modules (Lavoro, Hue); gitignored by `hub`. <!-- guard-private: allow Repository-local module directory -->
- `hub-plans`, cloned into `plans/`: plans, handoffs, `VISION.md`, `BACKLOG.md`; gitignored by `hub`.

## 1. Clone

```sh
git clone https://github.com/imalbi/hub.git
cd hub
git clone https://github.com/imalbi/hub-local.git modules.local # guard-private: allow Repository-local module directory
git clone https://github.com/imalbi/hub-plans.git plans
```

The two nested folders must keep these exact names: the server discovers `modules.local/` and every agent reads `plans/`. <!-- guard-private: allow Repository-local module directory -->

## 2. Install

Node 24 or later and pnpm 11 (`corepack enable` gives the version pinned in `package.json`).

```sh
pnpm install          # also points git at .githooks (pre-commit, commit-msg, pre-push)
pnpm check            # about 15 s; must be green before you change anything
pnpm dev              # server on 127.0.0.1:4180, web app through Vite
```

## 3. Your own config

Copy `config.example.json` to `config.local.json` and fill in your own values. It is gitignored and never shared: it holds personal settings and API keys (Indeed, Gemini). Get your own keys; do not reuse the owner's. Databases (`*.db`) are local too: you start with empty ones.

`.private-words` is the owner's private word list for `pnpm guard`. It stays on the owner's machine; the guard runs without it.

## 4. Before writing code

Read, in order: `AGENTS.md`, `plans/VISION.md`, `plans/README.md`, then `docs/modules.md` before touching a module. The rules there apply to people and agents alike.

## 5. Working in parallel

`AGENTS.md` was written for one owner with local-only git. With two people, until the owner updates it:

- `git pull --rebase` in all three repositories before starting a step.
- Take a step by writing your name in its row of `plans/README.md` and pushing `hub-plans` at once, so two people never run steps that edit the same files (Lavoro steps all touch `config.ts` and `server.ts`).
- After the reviewed commit, push the repositories it touched. Never force-push `main`.

## 6. Windows

Hub was built on Linux (CachyOS, Hyprland, Caelestia) and has not been run on Windows.

- The server and web app are plain Node and React; the Linux-only parts are the system integrations, which call Linux tools: audio (`wpctl`), media (`playerctl`), notifications (`notify-send`), the Hue light (BlueZ through `busctl`), AirPlay (`uxplay`), music (`mpv`), and the desktop install (systemd user service, Hyprland config).
- WSL2 with Ubuntu is the closest match for development, tests and e2e.
- Running Hub as a Windows desktop app means porting those integrations: plan it as its own step with the owner, not as part of installing.
