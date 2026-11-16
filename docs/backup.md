# Backup

Hub copies its own databases once per local day. The service is `apps/server/src/core/backup.ts`.

## What is copied

The core database (`hub.db`) and every module database that is open: public modules with `migrations` and discovered private ones. Each file is copied with `backup()` of `node:sqlite`, which is consistent on a live WAL database. The config file is not copied: it holds secrets, and a settings save already keeps its own `.bak`.

## Where

`<folder>/<YYYY-MM-DD>/hub.db` and `<folder>/<YYYY-MM-DD>/modules/<name>.db`. `<folder>` is `backup.dir` from the config; without it, `backups` next to the core database (`~/.local/state/hub/backups`). The folder is created with mode `0700`.

The default folder sits on the same disk as the data. It protects from a bad migration or a wrong delete, not from a dead disk: point `backup.dir` at another disk or a synced folder.

## When and how many

The server checks at start and then every hour; if today's folder does not exist, it makes it. No cron, no timer unit. A copy goes to `<date>.partial` and is renamed when every file is done, so a half copy is never taken for a good one. A second run on the same day replaces that day's folder.

The newest `backup.keep` dated folders stay (default 14, 1 to 365). Older ones are removed after a successful copy, never before; folders not named as a date are never touched.

Settings: Impostazioni > Sistema e agenti > Backup (`enabled`, `dir`, `keep`). With an in-memory core database (tests, the e2e fake) the service does nothing.

## Run it now

The Sistema page has a "Backup" row with an "Esegui" button, and the palette has "Esegui backup" (`backup.run`; the PC or an agent, not a paired device). A failure shows as "Ultima copia non riuscita": no path or driver message is stored or logged. A missed day raises no alarm.

## Restore by hand

Restore is rare and destructive, so there is no action for it.

1. Stop the service (`systemctl --user stop hub`).
2. Keep the current files aside (`~/.local/state/hub/hub.db`, `-wal`, `-shm`, and `modules/`).
3. Copy the dated `hub.db` and `modules/*.db` over the live ones, and delete the old `-wal` and `-shm` files next to them.
4. Start the service.
