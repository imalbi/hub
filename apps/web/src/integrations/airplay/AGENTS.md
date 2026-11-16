# Airplay (web)

- `src/integrations/airplay/`: `use-airplay.ts` (typed client from a type-only import of `AirPlayModuleDefinition`; one hook for the row and the tile so both show the same pushed state), `airplay-row.tsx` (icon toggle named `AirPlay: <state>`, `aria-pressed`), `airplay-tile.tsx` (null until the state arrives), `airplay-ui.ts` (the `ModuleUI` for `modules.example/airplay/` and the private wiring) and `copy.ts`.
