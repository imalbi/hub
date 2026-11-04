# Web (`@hub/web`)

React 19 SPA built with Vite. In dev, `/trpc` is proxied to the server (`vite.config.ts`). Two layouts: `/desk` (4K dashboard) and `/deck` (iPhone X PWA, 375x812, no scroll, dark).

## Where files go

```
src/
  main.tsx, index.css, routeTree.gen.ts
  routes/      file routes only: compose shell and module components, no logic of their own
  shell/       the frame around modules: desk.tsx (DeskShell), rail, zones.ts, backdrop, header-activity, deck-frame, use-layout
  theme/       theme.tsx (ThemeProvider), themes.ts, contrast.ts (+ test), theme-panel.tsx (Aspetto picker and editor)
  lib/         trpc.ts, auth.ts, auth-link.ts: client plumbing used everywhere
  components/  flat list of shared primitives (panel, tile, registry-button); ui/ = Hairline sources
  modules/<name>/  everything one module shows: desk-panel.tsx, deck-tile.tsx, use-<name>.ts, its provider
```

- A file used by one module lives in that module. It moves to `components/` (UI) or `lib/` (logic) only when a second module uses it. `shell/` never holds module content.
- Flat: at most two folder levels under `src/` (`modules/pomodoro/desk-panel.tsx`); `components/ui/` is the only deeper folder. No folder per component.
- A small piece used by one component stays in that component's file; it gets its own file in the module when a second file needs it or the file passes about 250 lines. No abstraction for later.
- No `index.ts` barrels: import from the defining file. One main export per file, file named after its role in kebab case (`desk-panel.tsx`, `deck-tile.tsx`); hooks are `use-*.ts`. Exported names stay descriptive (`PomodoroPanel`).

## Routing: TanStack Router (file-based)

- Routes are files in `src/routes/` (`__root.tsx`, `index.tsx` redirects to `/desk`, `desk.tsx` (layout), `desk.index.tsx` and `desk.{studio,media,system,devices}.tsx` (zones), `deck.tsx`). The Vite plugin regenerates `src/routeTree.gen.ts` in dev and build, `tsr generate` does it before typecheck. It is committed but never edited by hand, and excluded from lint and Prettier.
- In `vite.config.ts` the router plugin must stay before `react()`, or generation and code splitting fail silently.
- Each layout route calls `useLayout('desk' | 'deck')`, which sets `html[data-layout]`; layout-wide CSS (the desk root size) keys off that attribute.

## Data: tRPC + TanStack Query

- `src/lib/trpc.ts` exports `TRPCProvider` and `useTRPC` from `@trpc/tanstack-react-query`.
- Use the options proxy with plain TanStack Query hooks: `useQuery(trpc.health.queryOptions())`, `useMutation(trpc.x.mutationOptions())`. Invalidate with `queryClient.invalidateQueries({ queryKey: trpc.x.queryKey() })`.
- Do not wrap these in custom hooks unless the wrapper adds real logic (combining queries, a shared derived shape). Forwarding options is not logic.
- Types come from the server router. Never redeclare a server type by hand; infer it (`inferRouterOutputs<AppRouter>`) if you need it outside a hook.
- Live state comes from the server's subscriptions: `useSubscription(trpc.x.onState.subscriptionOptions())` (from `@trpc/tanstack-react-query`). `data` is `undefined` until the first push and survives reconnects (only `idle` clears it), which is what lets tiles show the last known state. No `refetchInterval`, and mutations do not invalidate anything: the server pushes the new state. The `state` queries stay on the server for tests and LLM tools; the web app does not call them.
- Links (`src/main.tsx`): `splitLink` sends subscriptions over `wsLink({ client: wsClient })` and everything else over `httpBatchLink`. `wsClient` lives in `src/lib/trpc.ts`, its URL is built from `location` (so the Vite proxy in dev and the LAN later both work), and the browser sends the page origin with the upgrade: the server refuses any origin not on its allowlist. In dev the page must be on `http://localhost:5173` or `http://127.0.0.1:5173`, or its origin must be in the server config (`server.allowedOrigins`), for example when Vite moves to another port.
- **Auth**: `src/lib/auth.ts` keeps the device token in `localStorage` (`hub.token`, `useToken()` with `useSyncExternalStore`). HTTP sends it as `Authorization: Bearer` (`headers` on `httpBatchLink`), the socket as `connectionParams` (a function, read on every connect). The server decides who a socket is once, when it connects, so `replaceToken(token | null)` in `src/lib/trpc.ts` closes `wsClient` first and the next subscription opens a new one with the new token; use it, never `setToken` alone. `authLink` (`src/lib/auth-link.ts`, first link) turns any `UNAUTHORIZED` answer, from a query, a mutation or a subscription, into `replaceToken(null)`: a revoked or unknown token lands on the pairing screen. A wrong pairing code is `BAD_REQUEST`, on purpose, so it never looks like a lost token.
- `useConnectionLost()` (`src/lib/trpc.ts`, `useSyncExternalStore` over `wsClient.connectionState`) is true when the state is `connecting` with an error, that is the socket closed or failed and the client is retrying; the first attempt has no error and is not "lost". The deck header swaps its status for `connection_lost` and tiles get `stale`. The page recovers by itself when the server comes back, no reload.
- `null` is a real answer (`media.state` with no player); `undefined` data means not loaded yet. Check `=== undefined`, not falsiness.

## Styling: Tailwind v4 + design tokens

Tailwind v4 through `@tailwindcss/vite`, no config file. All tokens live in `src/index.css`, with the reasoning for each scale in comments there. Tailwind's default scales are switched off (`--spacing: initial`, `--text-*: initial`...), so only named steps exist and an off-scale value does not compile.

- **Spacing** (4px base, rem): `3xs 2xs xs sm md lg xl 2xl 3xl 4xl`, chosen by relationship, not by eye: `xs` icon to label, `sm` rows of a list, `md` deck tile padding and related items, `lg` desk panel padding and gap between panels, `xl` between sections, `2xl`+ page margins. Fixed boxes: `touch` (44px minimum target), `icon-sm`, `icon`, `icon-lg`.
- **Type roles**, each with its own line height, tracking and weight: `text-caption`, `text-label`, `text-body`, `text-title`, `text-heading`, `text-display`, `text-hero` (major third scale). Pick a role; never set `leading-*`, `tracking-*` or `font-*` weight by hand to fake a new one. Numbers that change use `tabular-nums`.
- **Radii** `sm md lg xl full`: a shape inside another steps down one level so corners stay concentric (panel `xl`, card inside `lg`, control inside `md`).
- **Colors** only through semantic tokens with shadcn names (`bg-background`, `bg-surface`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-accent`...). Themes are value sets on `[data-theme]`; see "Themes".
- **Desk scaling**: `html[data-layout="desk"]` raises the root font size to 150% for the 3840px viewport at scale 1; everything is in rem, so the whole system scales together. Tune that one number after looking at the real monitor, never individual sizes.
- **No arbitrary values**: `p-[13px]`, `text-[#fff]` and friends are rejected by `pnpm --filter @hub/web lint:tokens` (part of `pnpm lint`). A missing value becomes a new token with a reason, not a one-off. When shadcn/Hairline components land in `src/components/ui/`, exclude that folder from the guard and map their sizes onto these tokens.
- Font: Urbanist (variable, OFL, self-hosted via `@fontsource-variable/urbanist`), provisional until the font decision in the design doc is closed.
- Components will come from Hairline UI via the shadcn CLI (`npx shadcn@latest add https://hairlineui.com/r/<name>.json`). Generated component code is ours to edit.

## Aesthetic

- Neutrals only, one theme accent for active state and the main figure; other color comes from cover art and photos. Keep the font, Urbanist, and a few weight roles; main figures are large and light.
- Borders are low-opacity 1px hairlines; separators inside panels are dashed. Panels use large radii, nested shapes step down one radius, controls/nav/filters/badges/player are pills. Lots of air and few elements per panel.
- Nav and player float above content and may overlap a panel edge. Only those layers use `.desk-glass`: translucent surface, backdrop blur and hairline in ink; solid surface without blur in paper. Panels stay `bg-surface`. Media backdrop uses blurred/darkened cover art; other zones use a quiet neutral radial gradient; paper uses plain background.
- Charts are greyscale, with the current value solid or in the accent. Do not invent metrics or player features the server cannot provide.
- State changes get short, purposeful motion: selection slides, labels reveal, numbers roll, icons morph. Nothing loops without purpose; the explicitly planned connected badge may breathe, stopping on disconnection/reduced motion. Reduced motion makes transitions instant, including WAAPI icon transitions.
- Every UI step compares its new baselines with the hub references by eye and writes one comparison line per screen in its plan Progress, stating what matches and what deliberately differs.

## Hairline components

- Vendored MIT sources and LICENSE live in `src/components/ui/`. Install via the shadcn CLI and the local `components.json`, preview with --dry-run/--diff, target src/components/ui and inspect dependencies first. Never let the CLI replace our tokens. Preserve upstream notices; generated code must pass the same types/lint/format/privacy checks as app code.
- Only `src/components/ui/` is excluded from the arbitrary-class guard, alongside generated Paraglide. Map visible spacing/type/colors to named tokens; upstream geometry/keyframes/timings can stay. Keyframes used through inline animation names must survive Tailwind compilation. Components are ours to adapt for semantics and accessibility; no broad lint exceptions.
- `components/registry-button.tsx` supplies Italian action labels and accessible names to ActionButton; it uses async mutations so pending/success/error represent the actual request. `data-status` exposes the current feedback state. A failure is handled by the component, not an unhandled rejection. Keep non-action navigation buttons separate.
- Desk shell owns MediaProvider: one media subscription and a typed artwork query cached by artKey. Only a matching successful image earns infinite stale time; null/mismatched replies throw for two bounded retries and remain eligible for ordinary query recovery on remount/focus/reconnect. The raw artwork URL is never in the browser. MediaPanel/Backdrop/PlayerPill share it. DeskRail keeps Link semantics and uses the Hairline motion primitive for a single transform-based indicator; routes, names and number shortcuts are unchanged.
- ThemeToggle is controlled with two Italian options mapped to ink/paper; it never writes a dark class or its own storage over DeskTheme. NumberRoll digits are decorative inside the desk timer; an output preserves readable/copyable time and supplies the timer description. Deck digits remain unchanged. Hold-to-confirm is installed for step 08; its wrapper must supply Italian copy and verify the full pointer/keyboard interaction.
- Header LiveActivity separates its changing visual countdown from a stable phase-only live announcement and the Apri Studio trigger name. A clock tick must not mutate the polite announcement; the main timer/output keep aria-live off. Do not put the ticking label back in a live region.

## Deck tiles

- `src/components/tile.tsx` (`Tile`) is the one deck control: a `<button>` with `aria-label` `"<label>: <state>"` (plus `, <status>` when the optional `status` prop is set: read by screen readers, not shown, for a fact the icon alone carries), an icon (`lucide-react`, `size-icon`, `aria-hidden`), a `text-label` label and a `text-caption` state clamped to 2 lines (a tile is ~105px wide at 375px). `pending` disables and dims it; `stale` (the live connection is down) dims it with `opacity-60` and keeps the last state; `error` swaps the state line for `tile_error` in the danger color until the next tap.
- A specific tile owns its state subscription and its mutation and lives in its module folder (`modules/audio/deck-tile.tsx`, `modules/media/deck-tile.tsx`), not in `src/routes/`: every file there becomes a route. `/deck` lays them out in a 3-column grid.
- Loading and unreachable-server copy is generic (`tile_loading` until the first push, `tile_unavailable` when there is no data and the connection is lost); the media tile icon shows the action a tap performs (Pause while playing), and its text is `artist - title` whatever the play state; the play state is the `status` prop (`media_playing`, `media_paused`, `media_stopped`), so the accessible name is `Musica: Artist - Title, in pausa` and e2e locates by role and name. In a browser, the icon still shows in the `svg` class.
- Output labels on the audio tile are values from the user's server config, not Paraglide copy.
- Tapping an action tile against the real server changes the user's audio or playback. Verify taps with the fake server (`pnpm test:e2e`, see `apps/e2e/AGENTS.md`), and take screenshots without tapping. A change to a tile, a layout or a token is covered by `apps/e2e` specs and baselines: the screenshot test fails on any pixel change, so update the baseline only when the change is intended.

## Deck shell, pairing, PWA

- `/deck` renders `PairingScreen` until a token is stored, and the tiles after; it never shows tiles to an unpaired browser, even on the PC. Both sit in `DeckFrame` (`src/shell/deck-frame.tsx`): the safe-area padding (`pt-safe-top`, `pr-safe-right`, `pb-safe-bottom`, `pl-safe-left`, tokens over `env(safe-area-inset-*)`, zero outside the iPhone) outside, the page padding and the header inside.
- `PairingScreen`: code input (`inputmode="numeric"`, `autocomplete="one-time-code"`, 6 digits), device name prefilled with `pairing_default_name`, one-line hint to install first when `navigator.standalone` is not true (on iOS the Home screen app does not share `localStorage` with Safari, so a token stored from Safari is lost).
- `src/modules/devices/desk-panel.tsx` is the Dispositivi panel on `/desk/devices`: create a code (shown with `text-display`, an `<output>` with an accessible name, and a countdown), list of paired devices with last seen, revoke with a plain confirm step (hold-to-confirm is a later step). `Date.now()` cannot be read in render (oxlint `react/purity`): the clock is state ticked every second and refreshed when a code arrives, or a fresh code reads 121 s. The device list refetches every 2 s only while a code is on screen, the one place polling beats a subscription.
- PWA without a service worker: `public/manifest.webmanifest` (standalone, `start_url` `/deck`), `public/apple-touch-icon.png` and `index.html` (`viewport-fit=cover`, `apple-mobile-web-app-*`). The ink background `#070707` appears in the manifest and `theme-color` because neither can read CSS variables; it is `--background` of the ink theme, change them together. The icon is a **placeholder** drawn in `public/icon.svg`: `rsvg-convert -w 180 -h 180 public/icon.svg -o public/apple-touch-icon.png`.

## Copy: Paraglide, Italian only

- The UI is Italian only, by choice: there is no English locale and none is planned. Paraglide is used to keep copy out of components and in one place, not to translate.
- `project.inlang/settings.json` has the single locale `it`; messages live in `messages/it.json`. Every user-facing string goes through `m.key()` from `src/paraglide/messages.js`, never hardcoded.
- Keys are snake_case English (`server_up`), values Italian, parameters in braces (`{seconds}`). Code, identifiers and comments stay English.
- Modules in `modules.local/` keep their copy next to them; how module messages plug into Paraglide is still to be decided when the first module lands. <!-- guard-private: allow Repository-local module directory -->
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

- `src/modules/pomodoro/use-pomodoro.ts` combines the state subscription, five mutation options, action/error state, and one client-only interval per mounted view, cleared on unmount. Countdown comes from endsAt or pausedRemainingMs; durationMs keeps progress correct across pauses and late joins. Refresh the local clock on each push to avoid a stale initial second. Never complete a phase on the client.
- `modules/pomodoro/deck-tile.tsx` reuses Tile (Timer icon), tap start/pause/resume only. Compact `Studio` copy keeps phase and remaining time visible in two lines at 375px; skip and stop live only in `modules/pomodoro/desk-panel.tsx`. The panel uses existing tokens, text-display numerals, a native accessible progress element plus a decorative SVG ring, and today's count.
- SVG ring geometry uses pathLength=100 and dash offset from progress. Do not combine pathLength with non-scaling-stroke: Chrome renders a completed arc even at zero. The existing spacing-px token sets the stroke. Tile state text stretches to its content width so long words cannot overflow padding. Both regressions have Playwright checks.

## Desk zones and panels

- `shell/zones.ts` is the single plain array of zone descriptors (id, path, Lucide icon, Paraglide label). Order: Panoramica `/desk`, Studio `/desk/studio`, Media `/desk/media`, Sistema `/desk/system`, Dispositivi `/desk/devices`. `routes/desk.tsx` owns the rail/title and Outlet; add zone contents as child routes, never put a feature inside the shell. TanStack supplies aria-current for exact active links.
- Content uses a 12-column grid, gap-lg and p-xl; panels declare col-span utilities. Existing root font scaling remains the only desk-wide scale. Named desk-rail and desk-inset spacing tokens reserve a touch target, rail padding/border and content gutters; no arbitrary margin to clear the rail.
- `components/panel.tsx` owns the shared surface/border/radius/padding and optional semantic h2/action row, with a unique heading id. DevicesPanel and PomodoroPanel use it; compact Pomodoro/Media/Audio and Status panels link to their zones. Studio has full Pomodoro, Media has playback plus all outputs, Sistema is status-only for now.
- The audio router has cycleOutput only. `modules/audio/desk-panel.tsx` shows outputs read-only, marks the active output in text and with a check, and exposes one Cambia uscita action in the Media zone. Never add per-output buttons without a registry action. Mutations/subscriptions still use the existing typed options proxy.
- Keys 1-5 navigate desk zones. The handler ignores modifiers, repeats, prevented events and input, textarea, select and contenteditable targets; it is removed on unmount. No deck shortcuts were added.
- Paper hover must use a light neutral token such as muted: surface-raised is dark in paper and makes dark secondary text disappear. Active/inactive rail hover classes are separate for the same reason.
- Full Pomodoro draws its entire border-token track under the progress arc; compact overview omits ring/daily statistics/skip-stop. Preserve the normalized SVG fix described above.

## Themes

- Built-in themes are CSS in `index.css`: `ink` (Scuro, also the `:root` default), `paper` (Chiaro), `moss` (Muschio) and `stone` (Pietra), the last two chosen with the taste skills. Each sets every color token plus `--glass`, `--glass-border`, `--glass-filter`, `--backdrop-glow` and `--backdrop-art-display`: dark themes frost the floating chrome and show the blurred cover, light ones turn both off. Never key a rule on a theme name (`[data-theme='paper'] .x`); add a variable instead.
- Themes held as data (Caelestia from the server, the owner's custom ones, the editor's `draft`) are drawn by `ThemeProvider` into one `<style>` through `themeCss(id, values)` (`theme/themes.ts`). Only `#rrggbb`/`#rrggbbaa` values reach it: the server validates with zod, `themeCss` checks again and drops a theme with any other value. Ids are `caelestia`, `custom-<id>` and `draft`.
- `ThemeProvider` (`theme/theme.tsx`) wraps both the desk shell and `/deck` (`remote` false on an unpaired deck: built-in themes only). The choice is per device in `localStorage` `hub.theme`; `setPreview(id)` shows a theme without choosing it (hover on a card); a theme that cannot be drawn resolves to a fixed one (deleted custom: `ink`; Caelestia missing or with unreadable text: `ink`/`paper` by its mode).
- Contrast (`theme/contrast.ts`, unit tests via `pnpm --filter @hub/web test`): 4.5:1 for foreground on background and surface, muted text on surface, button text on button; 3:1 for the accent on surface (focus ring). Borders are decorative hairlines and are not checked. The editor blocks saving below these, the Caelestia theme falls back when foreground on background fails.
- Theme changes cross-fade through the View Transitions API (`ThemeProvider`, CSS at the end of `index.css`, `--motion-standard`), instant on first paint and with reduced motion. `::view-transition` has `pointer-events: none`, or leaving a card mid-fade would never end its preview. Hover previews start only after the pointer rests 200 ms on a card.
- Aspetto (`theme/theme-panel.tsx`, in Dispositivi): a radio group of cards, each a miniature desk scoped with `data-theme`; duplicate any theme (a built-in one is read from its rendered preview through a 1px canvas, which converts oklch to hex), edit with live preview of the whole page, delete with hold-to-confirm. e2e chooses a theme by clicking its name (`apps/e2e/tests/themes.ts`).
