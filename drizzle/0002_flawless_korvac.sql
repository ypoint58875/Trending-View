DROP INDEX `saved_backtests_owner_instrument_unique`;--> statement-breakpoint
CREATE INDEX `saved_backtests_owner_instrument_idx` ON `saved_backtests` (`owner_email`,`provider`,`secid`);