# News (web)

- `modules/news/widget.tsx` (Panoramica): `small` shows last run in the header and count readout + status caption + `Aggiorna` below; `medium` puts count, status, last run, `Aggiorna`, and `Apri` in the header and lists up to 3 `headlines` with source below. `deck-tile.tsx` (Scrivania: the count as the tile badge, a tap opens the digest on the PC). `Tile` has an optional decorative `badge`; the number is also in `status` for screen readers. Dates are formatted with the day always shown: comparing with today would read the clock during render.
