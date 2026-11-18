# Calendar (web)

- `modules/calendar/month.tsx`, `week.tsx`, `agenda.tsx` each fetch their own range; the month's chip capacity hook lives in `MonthView` because it measures a ref in an effect that runs once. A shift (own event, kind `shift`) is a `DayEntry` with `kind: 'shift'`, `title` the person and `span` its text; the month grid filters it out of chips and "+N" but keeps it in the day panel. `filterEntries`/`Show` (Mostra) apply to week and agenda only.
- `view-state.ts` reads and writes localStorage in try/catch; a hook returned as an object must use arrow properties (`setView: (v) => ...`) or the type-aware lint flags the destructured method as unbound.
- `event-dialog.tsx` requires a scope for an occurrence before saving or removing. Whole-series editing uses the rule returned with `calendar.range`; occurrence edits and removals go through the dedicated actions so skips and undo stay consistent.
- `today.tsx` includes shifts in Oggi since step 87, in the server's mixed time order; shift names come from `person`.
