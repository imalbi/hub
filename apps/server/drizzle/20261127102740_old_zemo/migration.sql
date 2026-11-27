CREATE TABLE `brief_state` (
	`id` integer PRIMARY KEY,
	`day` text NOT NULL,
	`last_cursor_at` integer NOT NULL,
	`generated_at` integer,
	`status` text NOT NULL,
	`summary` text,
	`items_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `llm_usage` (
	`day` text PRIMARY KEY,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
