import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

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
    displayOrder: integer("display_order").notNull().default(0),
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
  ],
);
