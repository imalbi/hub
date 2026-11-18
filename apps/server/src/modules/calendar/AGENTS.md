# Calendar (server)

- `series.ts` expands weekly rules only inside the requested range. Virtual ids include the series and day; `calendar.ts` merges them with stored events and returns the series rule for editing.
- A single-occurrence edit writes a skip and an ordinary event in one transaction. Restoring removes both; removing a series leaves edited events visible as independent events until the series is restored.
- `calendarSeries.days` uses ISO weekdays 1 to 7, with a separate time pair for each day. Validate the merged rule on updates, including kind, dates and duplicate days.
