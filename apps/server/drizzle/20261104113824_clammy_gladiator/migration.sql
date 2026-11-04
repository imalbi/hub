CREATE TABLE `pomodoro_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`kind` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`completed` integer DEFAULT false NOT NULL
);
