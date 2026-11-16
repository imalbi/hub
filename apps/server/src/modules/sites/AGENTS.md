# Sites (server)

- Sites (`src/modules/sites/`) uses one module database: raw checks are retained for 24 hours, local-date rollups for 90 days. Each failed five-minute poll counts as five estimated down minutes; an unobserved day is no data. The poller must close before its database and tests inject fetch.
