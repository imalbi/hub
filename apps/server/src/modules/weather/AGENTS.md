# Weather (server)

- Weather (`modules/weather`): optional `{ name, latitude, longitude }` config; Open-Meteo forecast is cached for 30 minutes and the last result becomes stale on failure. Geocoding search is loopback-only. Tests inject `fetch` and fictional locations.
