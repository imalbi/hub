CREATE TABLE `catalog_state` (
	`id` integer PRIMARY KEY,
	`pending_apply` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `installed_modules` (
	`name` text PRIMARY KEY,
	`source_id` text NOT NULL,
	`module_path` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`version` text NOT NULL,
	`installed_commit` text NOT NULL,
	`installed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_installed_modules_source_id_module_sources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `module_sources`(`id`) -- guard-private: allow generated foreign key name
);
--> statement-breakpoint
CREATE TABLE `module_sources` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`url` text NOT NULL UNIQUE,
	`local_path` text NOT NULL,
	`commit_sha` text NOT NULL,
	`added_at` integer NOT NULL,
	`last_synced_at` integer NOT NULL,
	`sync_error` text
);
