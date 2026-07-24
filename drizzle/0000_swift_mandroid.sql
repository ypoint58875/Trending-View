CREATE TABLE `saved_backtests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`secid` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`exchange` text NOT NULL,
	`asset_type` text NOT NULL,
	`provider` text NOT NULL,
	`interval` text NOT NULL,
	`strategy_id` text NOT NULL,
	`parameters_json` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`initial_cash` real NOT NULL,
	`commission_percent` real NOT NULL,
	`slippage_percent` real NOT NULL,
	`total_return` real NOT NULL,
	`max_drawdown` real NOT NULL,
	`sharpe` real NOT NULL,
	`trade_count` integer NOT NULL,
	`score` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_backtests_owner_instrument_unique` ON `saved_backtests` (`owner_email`,`provider`,`secid`);--> statement-breakpoint
CREATE INDEX `saved_backtests_owner_updated_idx` ON `saved_backtests` (`owner_email`,`updated_at`);