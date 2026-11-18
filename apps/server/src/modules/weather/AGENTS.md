# Weather (server)

- Weather (`modules/weather`): optional `{ name, latitude, longitude }` config; Open-Meteo forecast is cached for 30 minutes and the last result becomes stale on failure. Geocoding search is loopback-only. Tests inject `fetch` and fictional locations.
- Without a reading, failed requests retry after 60 seconds, doubling to a 30-minute cap; a successful reading resets the retry and stale readings keep the 30-minute cadence.
