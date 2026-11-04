# Web (`@hub/web`)

React 19 SPA built with Vite. In dev, `/trpc` is proxied to the server (`vite.config.ts`). Two layouts: `/desk` (4K dashboard) and `/deck` (iPhone X PWA, 375x812, no scroll, dark).

## Routing: TanStack Router (file-based)

- Routes are files in `src/routes/` (`__root.tsx`, `index.tsx` redirects to `/desk`, `desk.tsx`, `deck.tsx`). The Vite plugin regenerates `src/routeTree.gen.ts` in dev and build, `tsr generate` does it before typecheck. It is committed but never edited by hand, and excluded from lint and Prettier.
- In `vite.config.ts` the router plugin must stay before `react()`, or generation and code splitting fail silently.
- Each layout route calls `useLayout('desk' | 'deck')`, which sets `html[data-layout]`; layout-wide CSS (the desk root size) keys off that attribute.

## Data: tRPC + TanStack Query

- `src/trpc.ts` exports `TRPCProvider` and `useTRPC` from `@trpc/tanstack-react-query`.
- Use the options proxy with plain TanStack Query hooks: `useQuery(trpc.health.queryOptions())`, `useMutation(trpc.x.mutationOptions())`. Invalidate with `queryClient.invalidateQueries({ queryKey: trpc.x.queryKey() })`.
- Do not wrap these in custom hooks unless the wrapper adds real logic (combining queries, a shared derived shape). Forwarding options is not logic.
- Types come from the server router. Never redeclare a server type by hand; infer it (`inferRouterOutputs<AppRouter>`) if you need it outside a hook.
- Live state comes from the server's subscriptions: `useSubscription(trpc.x.onState.subscriptionOptions())` (from `@trpc/tanstack-react-query`). `data` is `undefined` until the first push and survives reconnects (only `idle` clears it), which is what lets tiles show the last known state. No `refetchInterval`, and mutations do not invalidate anything: the server pushes the new state. The `state` queries stay on the server for tests and LLM tools; the web app does not call them.
- Links (`src/main.tsx`): `splitLink` sends subscriptions over `wsLink({ client: wsClient })` and everything else over `httpBatchLink`. `wsClient` lives in `src/trpc.ts`, its URL is built from `location` (so the Vite proxy in dev and the LAN later both work), and the browser sends the page origin with the upgrade: the server refuses any origin not on its allowlist. In dev the page must be on `http://localhost:5173` or `http://127.0.0.1:5173`, or its origin must be in the server config (`server.allowedOrigins`), for example when Vite moves to another port.
- `useConnectionLost()` (`src/trpc.ts`, `useSyncExternalStore` over `wsClient.connectionState`) is true when the state is `connecting` with an error, that is the socket closed or failed and the client is retrying; the first attempt has no error and is not "lost". The deck header swaps its status for `connection_lost` and tiles get `stale`. The page recovers by itself when the server comes back, no reload.
- `null` is a real answer (`media.state` with no player); `undefined` data means not loaded yet. Check `=== undefined`, not falsiness.

## Styling: Tailwind v4 + design tokens

Tailwind v4 through `@tailwindcss/vite`, no config file. All tokens live in `src/index.css`, with the reasoning for each scale in comments there. Tailwind's default scales are switched off (`--spacing: initial`, `--text-*: initial`...), so only named steps exist and an off-scale value does not compile.

- **Spacing** (4px base, rem): `3xs 2xs xs sm md lg xl 2xl 3xl 4xl`, chosen by relationship, not by eye: `xs` icon to label, `sm` rows of a list, `md` deck tile padding and related items, `lg` desk panel padding and gap between panels, `xl` between sections, `2xl`+ page margins. Fixed boxes: `touch` (44px minimum target), `icon-sm`, `icon`, `icon-lg`.
- **Type roles**, each with its own line height, tracking and weight: `text-caption`, `text-label`, `text-body`, `text-title`, `text-heading`, `text-display`, `text-hero` (major third scale). Pick a role; never set `leading-*`, `tracking-*` or `font-*` weight by hand to fake a new one. Numbers that change use `tabular-nums`.
- **Radii** `sm md lg xl full`: a shape inside another steps down one level so corners stay concentric (panel `xl`, card inside `lg`, control inside `md`).
- **Colors** only through semantic tokens with shadcn names (`bg-background`, `bg-surface`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-accent`...). Themes are value sets on `[data-theme="ink"]` (dark, default) and `[data-theme="paper"]` (light).
- **Desk scaling**: `html[data-layout="desk"]` raises the root font size to 150% for the 3840px viewport at scale 1; everything is in rem, so the whole system scales together. Tune that one number after looking at the real monitor, never individual sizes.
- **No arbitrary values**: `p-[13px]`, `text-[#fff]` and friends are rejected by `pnpm --filter @hub/web lint:tokens` (part of `pnpm lint`). A missing value becomes a new token with a reason, not a one-off. When shadcn/Hairline components land in `src/components/ui/`, exclude that folder from the guard and map their sizes onto these tokens.
- Font: Urbanist (variable, OFL, self-hosted via `@fontsource-variable/urbanist`), provisional until the font decision in the design doc is closed.
- Components will come from Hairline UI via the shadcn CLI (`npx shadcn@latest add https://hairlineui.com/r/<name>.json`). Generated component code is ours to edit.
- Aesthetic: monochrome hairline UI, color only from content (cover art, photos, the one highlighted value), 1px low-opacity borders, large radii, pill controls, floating pill nav and player. References: swipefile entries with `project: "hub"`.

## Deck tiles

- `src/components/tile.tsx` (`Tile`) is the one deck control: a `<button>` with `aria-label` `"<label>: <state>"`, an icon (`lucide-react`, `size-icon`, `aria-hidden`), a `text-label` label and a `text-caption` state clamped to 2 lines (a tile is ~105px wide at 375px). `pending` disables and dims it; `stale` (the live connection is down) dims it with `opacity-60` and keeps the last state; `error` swaps the state line for `tile_error` in the danger color until the next tap.
- A specific tile owns its state subscription and its mutation and lives in `src/deck/` (`audio-output-tile.tsx`, `media-tile.tsx`), not in `src/routes/`: every file there becomes a route. `/deck` lays them out in a 3-column grid.
- Loading and unreachable-server copy is generic (`tile_loading` until the first push, `tile_unavailable` when there is no data and the connection is lost); the media tile icon shows the action a tap performs (Pause while playing), and its label is `artist - title` whatever the play state, so a play/pause change only shows in the icon (watch the `svg` class, not the `aria-label`, when measuring it).
- Output labels on the audio tile are values from the user's server config, not Paraglide copy.
- Tapping an action tile against the real server changes the user's audio or playback. Verify taps with a server built with a fake `run`, and take screenshots without tapping.

## Copy: Paraglide, Italian only

- The UI is Italian only, by choice: there is no English locale and none is planned. Paraglide is used to keep copy out of components and in one place, not to translate.
- `project.inlang/settings.json` has the single locale `it`; messages live in `messages/it.json`. Every user-facing string goes through `m.key()` from `src/paraglide/messages.js`, never hardcoded.
- Keys are snake_case English (`server_up`), values Italian, parameters in braces (`{seconds}`). Code, identifiers and comments stay English.
- Modules in `modules.local/` keep their copy next to them; how module messages plug into Paraglide is still to be decided when the first module lands.
- `src/paraglide/` is generated (Vite plugin in dev, `pnpm --filter @hub/web i18n` before typecheck) and gitignored: never edit it.

## No magic values

- Sizes, spacing, radii, colors, durations and font sizes come from theme tokens or the Tailwind scale, never inline literals. If a value is missing, add a token in `src/index.css` and reuse it; a per-file `const SIZE = 24` is a second source of truth that drifts.
- Before building a component, check `src/components/` (and Hairline UI) for one to reuse or extend.

## Conventions

- Function components and named exports.
- Relative imports keep the `.tsx`/`.ts` extension, like the server.
- Touch targets on the deck at least 44px; icon-only buttons carry an accessible label (`aria-label`). Every action button shows pending, done and error states.
- Destructive actions use hold-to-confirm, never a single tap.
