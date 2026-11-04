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
- **Auth**: `src/auth.ts` keeps the device token in `localStorage` (`hub.token`, `useToken()` with `useSyncExternalStore`). HTTP sends it as `Authorization: Bearer` (`headers` on `httpBatchLink`), the socket as `connectionParams` (a function, read on every connect). The server decides who a socket is once, when it connects, so `replaceToken(token | null)` in `src/trpc.ts` closes `wsClient` first and the next subscription opens a new one with the new token; use it, never `setToken` alone. `authLink` (`src/auth-link.ts`, first link) turns any `UNAUTHORIZED` answer, from a query, a mutation or a subscription, into `replaceToken(null)`: a revoked or unknown token lands on the pairing screen. A wrong pairing code is `BAD_REQUEST`, on purpose, so it never looks like a lost token.
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

- `src/components/tile.tsx` (`Tile`) is the one deck control: a `<button>` with `aria-label` `"<label>: <state>"` (plus `, <status>` when the optional `status` prop is set: read by screen readers, not shown, for a fact the icon alone carries), an icon (`lucide-react`, `size-icon`, `aria-hidden`), a `text-label` label and a `text-caption` state clamped to 2 lines (a tile is ~105px wide at 375px). `pending` disables and dims it; `stale` (the live connection is down) dims it with `opacity-60` and keeps the last state; `error` swaps the state line for `tile_error` in the danger color until the next tap.
- A specific tile owns its state subscription and its mutation and lives in `src/deck/` (`audio-output-tile.tsx`, `media-tile.tsx`), not in `src/routes/`: every file there becomes a route. `/deck` lays them out in a 3-column grid.
- Loading and unreachable-server copy is generic (`tile_loading` until the first push, `tile_unavailable` when there is no data and the connection is lost); the media tile icon shows the action a tap performs (Pause while playing), and its text is `artist - title` whatever the play state; the play state is the `status` prop (`media_playing`, `media_paused`, `media_stopped`), so the accessible name is `Musica: Artist - Title, in pausa` and e2e locates by role and name. In a browser, the icon still shows in the `svg` class.
- Output labels on the audio tile are values from the user's server config, not Paraglide copy.
- Tapping an action tile against the real server changes the user's audio or playback. Verify taps with the fake server (`pnpm test:e2e`, see `apps/e2e/AGENTS.md`), and take screenshots without tapping. A change to a tile, a layout or a token is covered by `apps/e2e` specs and baselines: the screenshot test fails on any pixel change, so update the baseline only when the change is intended.

## Deck shell, pairing, PWA

- `/deck` renders `PairingScreen` until a token is stored, and the tiles after; it never shows tiles to an unpaired browser, even on the PC. Both sit in `DeckFrame` (`src/deck/deck-frame.tsx`): the safe-area padding (`pt-safe-top`, `pr-safe-right`, `pb-safe-bottom`, `pl-safe-left`, tokens over `env(safe-area-inset-*)`, zero outside the iPhone) outside, the page padding and the header inside.
- `PairingScreen`: code input (`inputmode="numeric"`, `autocomplete="one-time-code"`, 6 digits), device name prefilled with `pairing_default_name`, one-line hint to install first when `navigator.standalone` is not true (on iOS the Home screen app does not share `localStorage` with Safari, so a token stored from Safari is lost).
- `src/desk/devices-panel.tsx` is the Dispositivi panel on `/desk`: create a code (shown with `text-display`, an `<output>` with an accessible name, and a countdown), list of paired devices with last seen, revoke with a plain confirm step (hold-to-confirm is a later step). `Date.now()` cannot be read in render (oxlint `react/purity`): the clock is state ticked every second and refreshed when a code arrives, or a fresh code reads 121 s. The device list refetches every 2 s only while a code is on screen, the one place polling beats a subscription.
- PWA without a service worker: `public/manifest.webmanifest` (standalone, `start_url` `/deck`), `public/apple-touch-icon.png` and `index.html` (`viewport-fit=cover`, `apple-mobile-web-app-*`). The ink background `#070707` appears in the manifest and `theme-color` because neither can read CSS variables; it is `--background` of the ink theme, change them together. The icon is a **placeholder** drawn in `public/icon.svg`: `rsvg-convert -w 180 -h 180 public/icon.svg -o public/apple-touch-icon.png`.

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

## Pomodoro

- `src/pomodoro.ts` combines the state subscription, five mutation options, action/error state, and one client-only interval per mounted view, cleared on unmount. Countdown comes from endsAt or pausedRemainingMs; durationMs keeps progress correct across pauses and late joins. Refresh the local clock on each push to avoid a stale initial second. Never complete a phase on the client.
- `deck/pomodoro-tile.tsx` reuses Tile (Timer icon), tap start/pause/resume only. Compact `Studio` copy keeps phase and remaining time visible in two lines at 375px; skip and stop live only in `desk/pomodoro-panel.tsx`. The panel uses existing tokens, text-display numerals, a native accessible progress element plus a decorative SVG ring, and today's count.
- SVG ring geometry uses pathLength=100 and dash offset from progress. Do not combine pathLength with non-scaling-stroke: Chrome renders a completed arc even at zero. The existing spacing-px token sets the stroke. Tile state text stretches to its content width so long words cannot overflow padding. Both regressions have Playwright checks.
