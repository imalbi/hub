ALTER TABLE `calendar_events` ADD `kind` text DEFAULT 'event' NOT NULL;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `person` text;