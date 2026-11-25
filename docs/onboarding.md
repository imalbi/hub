# Developer onboarding

The public `hub` repository contains the server, web app, tests, desktop templates and development rules. It runs without access to private repositories.

## 1. Clone and install

Use Node 24 or later and pnpm 11, with the version pinned in `package.json`.

```sh
git clone https://github.com/imalbi/hub.git
cd hub
pnpm install
pnpm check
pnpm demo
```

Installation sets up the Git hooks for privacy checks and verification. The demo prints local desk/deck URLs and uses fake data and temporary storage; it does not control the desktop.

## 2. Configure a real instance

Copy `config.example.json` to `config.local.json` and fill in your own values. Configuration and databases are gitignored. Keep credentials and device identifiers private. `pnpm dev` starts the real server on loopback with Vite; see the root [README](../README.md) for desktop requirements and trust boundaries.

`.private-words` is an optional private word list for the guard. It stays on its owner's machine; checks work without it.

## 3. Add modules

Read [Writing a module](modules.md) before changing a module. Optional trusted Git catalogs install into `modules.installed/`, with repository clones in `modules.repos/`. No catalog is registered by default. Personal modules belong in the gitignored `modules.local/`. <!-- guard-private: allow Repository-local module directory -->

The owner's additional repositories are **private** and require explicit access:

- `hub-local`, optionally cloned into `modules.local/`, holds private modules. <!-- guard-private: allow Repository-local module directory -->
- `hub-plans`, optionally cloned into `plans/`, holds the project vision, approved plans and handoffs.

Neither is required for public development. Collaborators using that private planning workflow must keep the exact folder names and follow the claim/review process in `AGENTS.md` and `plans/README.md`.

## 4. Change and verify

Read `AGENTS.md` first. Authorized collaborators also read the private `plans/VISION.md` and `plans/README.md`. Pull the repositories you have access to before starting; claim a planned step before editing and do not overlap changes to the same files.

Run targeted tests while working, `pnpm check` before handoff and the completion gate required by `AGENTS.md` before committing or pushing. Never commit local configuration or personal fixtures.

## Platform support

Hub was built on Linux with Hyprland and Caelestia. Windows has not been verified. The clients and fake demo use Node and React; real desktop integrations call Linux tools such as `wpctl`, `playerctl`, `notify-send`, systemd and Hyprland. Optional modules can have additional system dependencies. Porting these integrations is separate from installation.
