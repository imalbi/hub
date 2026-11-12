CREATE TABLE `agent_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`agent_id` integer,
	`name` text NOT NULL,
	`action` text NOT NULL,
	`input` text NOT NULL,
	`result` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`token_hash` text NOT NULL UNIQUE,
	`created_at` integer NOT NULL
);
