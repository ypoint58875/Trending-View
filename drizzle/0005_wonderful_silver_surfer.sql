CREATE TABLE `screening_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`instrument_key` text NOT NULL,
	`secid` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`exchange` text NOT NULL,
	`asset_type` text NOT NULL,
	`provider` text NOT NULL,
	`source` text NOT NULL,
	`interval` text NOT NULL,
	`price_adjustment` text NOT NULL,
	`fetched_at` text NOT NULL,
	`last_bar_date` text NOT NULL,
	`bar_count` integer NOT NULL,
	`data_fingerprint` text NOT NULL,
	`validation_mode` text NOT NULL,
	`validation_config_json` text NOT NULL,
	`objective` text NOT NULL,
	`settings_json` text NOT NULL,
	`candidates_json` text NOT NULL,
	`selected_candidate_key` text,
	`validation_report_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `screening_runs_owner_instrument_created_idx` ON `screening_runs` (`owner_email`,`instrument_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `screening_runs_owner_created_idx` ON `screening_runs` (`owner_email`,`created_at`);