ALTER TABLE `saved_backtests` ADD `rolling_total_return` real;--> statement-breakpoint
ALTER TABLE `saved_backtests` ADD `rank_history_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `saved_backtests` ADD `last_rank_snapshot_key` text;--> statement-breakpoint
ALTER TABLE `saved_backtests` ADD `rolling_updated_at` text;
