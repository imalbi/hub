CREATE TABLE `calendar_series` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`person` text,
	`days` text NOT NULL,
	`from_day` text NOT NULL,
	`until_day` text,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`removed_at` integer
);
--> statement-breakpoint
CREATE TABLE `calendar_series_skips` (
	`series_id` text NOT NULL,
	`day` text NOT NULL,
	CONSTRAINT `calendar_series_skips_pk` PRIMARY KEY(`series_id`, `day`),
	CONSTRAINT `fk_calendar_series_skips_series_id_calendar_series_id_fk` FOREIGN KEY (`series_id`) REFERENCES `calendar_series`(`id`) -- guard-private: allow Generated foreign key name
);
--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `series_id` text;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `series_day` text;