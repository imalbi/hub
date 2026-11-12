CREATE TABLE `jobs` (
	`id` text PRIMARY KEY,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`exit_code` integer,
	`output` text DEFAULT '[]' NOT NULL
);
