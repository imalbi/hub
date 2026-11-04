# Hub

A personal control center: a Fastify server on the desktop, a dashboard in a Hyprland special workspace and a Stream Deck style panel on an old iPhone.

```sh
pnpm install
pnpm dev        # server on 127.0.0.1:4180, web on Vite's port with /trpc proxied
pnpm typecheck
pnpm test
```

## Desktop integration

Preview the files and diffs without writing configuration or starting services:

```sh
pnpm desktop:install
```

To install, run `pnpm desktop:install --apply` yourself. It builds the web app, backs up existing files, adds the Lua block to Caelestia's `hypr-user.lua`, merges its toggle into `cli.json`, and enables/starts the systemd user service. Reload Hyprland, then press Super+H to show or hide the desk. Hub starts with the next Hyprland session too.

The service uses the resolved Node binary, including with fnm, and the existing config/database defaults. Re-run the apply command after updates to rebuild the app; restart a running backend with `systemctl --user restart hub.service`.

`pnpm desktop:install --uninstall` previews removal; add `--apply` to remove only Hub's integration. Unchanged files regain their original text, unrelated later edits are retained, and backups stay alongside the files. Uninstall leaves the repository, database and personal Hub config in place.

## License

Copyright 2026 Alberto Cerqua. All rights reserved. The source is public so it can be read, not reused or redistributed.
