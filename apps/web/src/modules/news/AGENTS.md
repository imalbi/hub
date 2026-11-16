# News (web)

- `modules/news/widget.tsx` (Panoramica, small or medium: last run, item count as the big figure, Aggiorna and Apri on the PC) and `deck-tile.tsx` (Scrivania: the count as the tile badge, a tap opens the digest on the PC). `Tile` has an optional decorative `badge`; the number is also in `status` for screen readers. Dates are formatted with the day always shown: comparing with today would read the clock during render.
