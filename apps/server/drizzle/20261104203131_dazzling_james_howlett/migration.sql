CREATE TABLE `pomodoro_settings` (
	`id` integer PRIMARY KEY,
	`focus_minutes` real NOT NULL,
	`short_break_minutes` real NOT NULL,
	`long_break_minutes` real NOT NULL,
	`long_break_every` integer NOT NULL,
	`sound` integer NOT NULL,
	`updated_at` integer NOT NULL
);
