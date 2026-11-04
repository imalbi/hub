CREATE TABLE `devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`token_hash` text NOT NULL UNIQUE,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
