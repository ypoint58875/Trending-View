import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const savedBacktestFolders = sqliteTable(
  "saved_backtest_folders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerEmail: text("owner_email").notNull(),
    scope: text("scope").notNull(),
    contextKey: text("context_key").notNull(),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("saved_backtest_folders_owner_context_name_idx").on(
      table.ownerEmail,
      table.scope,
      table.contextKey,
      table.name,
    ),
    index("saved_backtest_folders_owner_display_order_idx").on(
      table.ownerEmail,
      table.scope,
      table.contextKey,
      table.displayOrder,
    ),
  ],
);

export const savedBacktests = sqliteTable(
  "saved_backtests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerEmail: text("owner_email").notNull(),
    secid: text("secid").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    exchange: text("exchange").notNull(),
    assetType: text("asset_type").notNull(),
    provider: text("provider").notNull(),
    interval: text("interval").notNull(),
    strategyId: text("strategy_id").notNull(),
    parametersJson: text("parameters_json").notNull(),
    strategyPlanJson: text("strategy_plan_json"),
    indicatorConfigurationsJson: text("indicator_configurations_json"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    initialCash: real("initial_cash").notNull(),
    commissionPercent: real("commission_percent").notNull(),
    slippagePercent: real("slippage_percent").notNull(),
    totalReturn: real("total_return").notNull(),
    maxDrawdown: real("max_drawdown").notNull(),
    sharpe: real("sharpe").notNull(),
    tradeCount: integer("trade_count").notNull(),
    score: real("score").notNull(),
    rollingTotalReturn: real("rolling_total_return"),
    rankHistoryJson: text("rank_history_json").notNull().default("[]"),
    lastRankSnapshotKey: text("last_rank_snapshot_key"),
    rollingUpdatedAt: text("rolling_updated_at"),
    displayOrder: integer("display_order").notNull().default(0),
    instrumentFolderId: integer("instrument_folder_id").references(
      () => savedBacktestFolders.id,
      { onDelete: "set null" },
    ),
    strategyFolderId: integer("strategy_folder_id").references(
      () => savedBacktestFolders.id,
      { onDelete: "set null" },
    ),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("saved_backtests_owner_instrument_idx").on(
      table.ownerEmail,
      table.provider,
      table.secid,
    ),
    index("saved_backtests_owner_updated_idx").on(
      table.ownerEmail,
      table.updatedAt,
    ),
    index("saved_backtests_owner_display_order_idx").on(
      table.ownerEmail,
      table.displayOrder,
    ),
    index("saved_backtests_owner_instrument_folder_idx").on(
      table.ownerEmail,
      table.instrumentFolderId,
    ),
    index("saved_backtests_owner_strategy_folder_idx").on(
      table.ownerEmail,
      table.strategyFolderId,
    ),
  ],
);

export const screeningRuns = sqliteTable(
  "screening_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerEmail: text("owner_email").notNull(),
    instrumentKey: text("instrument_key").notNull(),
    secid: text("secid").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    exchange: text("exchange").notNull(),
    assetType: text("asset_type").notNull(),
    provider: text("provider").notNull(),
    source: text("source").notNull(),
    interval: text("interval").notNull(),
    priceAdjustment: text("price_adjustment").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    lastBarDate: text("last_bar_date").notNull(),
    barCount: integer("bar_count").notNull(),
    dataFingerprint: text("data_fingerprint").notNull(),
    temporaryQuoteProvider: text("temporary_quote_provider"),
    temporaryQuoteDate: text("temporary_quote_date"),
    temporaryQuoteFetchedAt: text("temporary_quote_fetched_at"),
    validationMode: text("validation_mode").notNull(),
    validationConfigJson: text("validation_config_json").notNull(),
    objective: text("objective").notNull(),
    settingsJson: text("settings_json").notNull(),
    candidatesJson: text("candidates_json").notNull(),
    selectedCandidateKey: text("selected_candidate_key"),
    validationReportJson: text("validation_report_json"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("screening_runs_owner_instrument_created_idx").on(
      table.ownerEmail,
      table.instrumentKey,
      table.createdAt,
    ),
    index("screening_runs_owner_created_idx").on(
      table.ownerEmail,
      table.createdAt,
    ),
  ],
);
