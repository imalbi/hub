CREATE TABLE `calendar_events` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`day` text NOT NULL,
	`start` text,
	`end` text,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`removed_at` integer
);
