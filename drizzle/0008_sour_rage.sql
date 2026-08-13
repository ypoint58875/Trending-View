CREATE TABLE `saved_backtest_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`scope` text NOT NULL,
	`context_key` text NOT NULL,
	`name` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_backtest_folders_owner_context_name_idx` ON `saved_backtest_folders` (`owner_email`,`scope`,`context_key`,`name`);--> statement-breakpoint
CREATE INDEX `saved_backtest_folders_owner_display_order_idx` ON `saved_backtest_folders` (`owner_email`,`scope`,`context_key`,`display_order`);--> statement-breakpoint
ALTER TABLE `saved_backtests` ADD `instrument_folder_id` integer REFERENCES saved_backtest_folders(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `saved_backtests` ADD `strategy_folder_id` integer REFERENCES saved_backtest_folders(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `saved_backtests_owner_instrument_folder_idx` ON `saved_backtests` (`owner_email`,`instrument_folder_id`);--> statement-breakpoint
CREATE INDEX `saved_backtests_owner_strategy_folder_idx` ON `saved_backtests` (`owner_email`,`strategy_folder_id`);
