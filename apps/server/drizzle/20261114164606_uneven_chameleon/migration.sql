CREATE TABLE `notes` (
	`id` text PRIMARY KEY,
	`text` text NOT NULL,
	`for_day` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`removed_at` integer
);
