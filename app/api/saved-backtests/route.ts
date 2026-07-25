import { and, desc, eq, sql } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { savedBacktests } from "@/db/schema";
import {
  buildLegacyStrategyPlan,
  parseSaveBacktestInput,
  parseStrategyAllocationPlan,
  type SavedBacktestRecord,
} from "@/lib/analysis/saved-backtests";
import type { StrategyParameters } from "@/lib/analysis/strategies";

export const dynamic = "force-dynamic";

type SavedBacktestRow = typeof savedBacktests.$inferSelect;

async function getSavedBacktestDb() {
  const { getDb } = await import("@/db");
  return getDb();
}

async function resolveOwnerEmail(request: Request) {
  const user = await getChatGPTUser();
  if (user) return user.email.trim().toLowerCase();

  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1"
    ? "local@quantscope.invalid"
    : null;
}

function parseStoredParameters(value: string): StrategyParameters {
  const parameters = JSON.parse(value) as unknown;
  if (
    typeof parameters !== "object" ||
    parameters === null ||
    Array.isArray(parameters)
  ) {
    throw new Error("Stored backtest parameters are invalid");
  }
  return parameters as StrategyParameters;
}

function parseStoredPlan(
  value: string | null,
  strategyId: SavedBacktestRecord["strategyId"],
  parameters: StrategyParameters,
) {
  if (!value) return buildLegacyStrategyPlan(strategyId, parameters);
  const plan = parseStrategyAllocationPlan(JSON.parse(value) as unknown);
  if (!plan) throw new Error("Stored backtest strategy plan is invalid");
  return plan;
}

function toRecord(row: SavedBacktestRow): SavedBacktestRecord {
  const strategyId = row.strategyId as SavedBacktestRecord["strategyId"];
  const parameters = parseStoredParameters(row.parametersJson);
  return {
    id: row.id,
    instrument: {
      secid: row.secid,
      code: row.code,
      name: row.name,
      exchange: row.exchange as SavedBacktestRecord["instrument"]["exchange"],
      assetType:
        row.assetType as SavedBacktestRecord["instrument"]["assetType"],
      provider: row.provider as SavedBacktestRecord["instrument"]["provider"],
    },
    interval: row.interval as SavedBacktestRecord["interval"],
    strategyId,
    parameters,
    plan: parseStoredPlan(row.strategyPlanJson, strategyId, parameters),
    startDate: row.startDate,
    endDate: row.endDate,
    initialCash: row.initialCash,
    commissionPercent: row.commissionPercent,
    slippagePercent: row.slippagePercent,
    metrics: {
      totalReturn: row.totalReturn,
      maxDrawdown: row.maxDrawdown,
      sharpe: row.sharpe,
      tradeCount: row.tradeCount,
      score: row.score,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function persistenceError(error: unknown) {
  console.error("Saved backtest persistence failed", {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return Response.json(
    { error: "PERSISTENCE_UNAVAILABLE" },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const ownerEmail = await resolveOwnerEmail(request);
  if (!ownerEmail) {
    return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  try {
    const db = await getSavedBacktestDb();
    const rows = await db
      .select()
      .from(savedBacktests)
      .where(eq(savedBacktests.ownerEmail, ownerEmail))
      .orderBy(desc(savedBacktests.updatedAt), desc(savedBacktests.id))
      .limit(20);
    return Response.json({ savedBacktests: rows.map(toRecord) });
  } catch (error) {
    return persistenceError(error);
  }
}

export async function POST(request: Request) {
  const ownerEmail = await resolveOwnerEmail(request);
  if (!ownerEmail) {
    return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }
  const input = parseSaveBacktestInput(payload);
  if (!input) {
    return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const values = {
    ownerEmail,
    secid: input.instrument.secid,
    code: input.instrument.code,
    name: input.instrument.name,
    exchange: input.instrument.exchange,
    assetType: input.instrument.assetType,
    provider: input.instrument.provider,
    interval: input.interval,
    strategyId: input.strategyId,
    parametersJson: JSON.stringify(input.parameters),
    strategyPlanJson: JSON.stringify(input.plan),
    startDate: input.startDate,
    endDate: input.endDate,
    initialCash: input.initialCash,
    commissionPercent: input.commissionPercent,
    slippagePercent: input.slippagePercent,
    totalReturn: input.metrics.totalReturn,
    maxDrawdown: input.metrics.maxDrawdown,
    sharpe: input.metrics.sharpe,
    tradeCount: input.metrics.tradeCount,
    score: input.metrics.score,
  };

  try {
    const db = await getSavedBacktestDb();
    const [row] = await db
      .insert(savedBacktests)
      .values(values)
      .onConflictDoUpdate({
        target: [
          savedBacktests.ownerEmail,
          savedBacktests.provider,
          savedBacktests.secid,
        ],
        set: {
          ...values,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .returning();
    return Response.json({ savedBacktest: toRecord(row) }, { status: 201 });
  } catch (error) {
    return persistenceError(error);
  }
}

export async function DELETE(request: Request) {
  const ownerEmail = await resolveOwnerEmail(request);
  if (!ownerEmail) {
    return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "INVALID_ID" }, { status: 400 });
  }

  try {
    const db = await getSavedBacktestDb();
    const rows = await db
      .delete(savedBacktests)
      .where(
        and(
          eq(savedBacktests.id, id),
          eq(savedBacktests.ownerEmail, ownerEmail),
        ),
      )
      .returning({ id: savedBacktests.id });
    if (rows.length === 0) {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return Response.json({ deleted: true });
  } catch (error) {
    return persistenceError(error);
  }
}
