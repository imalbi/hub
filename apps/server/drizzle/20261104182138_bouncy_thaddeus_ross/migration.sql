CREATE TABLE `themes` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`base` text NOT NULL,
	`values` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
