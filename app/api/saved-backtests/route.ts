import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { resolveOwnerEmail } from "@/app/api/owner";
import {
  savedBacktestFolders,
  savedBacktests,
} from "@/db/schema";
import {
  MAX_SAVED_BACKTEST_FOLDERS,
  MAX_SAVED_BACKTEST_SCROLL_RECORDS,
  buildLegacyStrategyPlan,
  parseSaveBacktestInput,
  parseSavedBacktestOrderInput,
  parseSavedBacktestRollingUpdateInput,
  parseStrategyAllocationPlan,
  savedBacktestInstrumentKey,
  shouldReplaceSavedBacktest,
  type SavedBacktestRecord,
  type SavedBacktestFolder,
} from "@/lib/analysis/saved-backtests";
import {
  parseIndicatorConfigurations,
  type IndicatorConfiguration,
} from "@/lib/analysis/indicator-registry";
import type { StrategyParameters } from "@/lib/analysis/strategies";

export const dynamic = "force-dynamic";

type SavedBacktestRow = typeof savedBacktests.$inferSelect;

async function getSavedBacktestDb() {
  const { getDb } = await import("@/db");
  return getDb();
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

function parseStoredIndicators(value: string | null): IndicatorConfiguration[] {
  if (!value) return [];
  const indicators = parseIndicatorConfigurations(JSON.parse(value) as unknown);
  if (!indicators) {
    throw new Error("Stored backtest indicator configurations are invalid");
  }
  return indicators;
}

function rowInstrument(row: SavedBacktestRow): SavedBacktestRecord["instrument"] {
  return {
    secid: row.secid,
    code: row.code,
    name: row.name,
    exchange: row.exchange as SavedBacktestRecord["instrument"]["exchange"],
    assetType: row.assetType as SavedBacktestRecord["instrument"]["assetType"],
    provider: row.provider as SavedBacktestRecord["instrument"]["provider"],
  };
}

function toRecord(row: SavedBacktestRow): SavedBacktestRecord {
  const strategyId = row.strategyId as SavedBacktestRecord["strategyId"];
  const parameters = parseStoredParameters(row.parametersJson);
  return {
    id: row.id,
    instrumentFolderId: row.instrumentFolderId,
    strategyFolderId: row.strategyFolderId,
    instrument: rowInstrument(row),
    interval: row.interval as SavedBacktestRecord["interval"],
    strategyId,
    parameters,
    plan: parseStoredPlan(row.strategyPlanJson, strategyId, parameters),
    indicators: parseStoredIndicators(row.indicatorConfigurationsJson),
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
    rollingTotalReturn: row.rollingTotalReturn,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toFolderRecord(
  row: typeof savedBacktestFolders.$inferSelect,
): SavedBacktestFolder {
  if (row.scope !== "instrument" && row.scope !== "strategy") {
    throw new Error("Stored saved-backtest folder scope is invalid");
  }
  return {
    id: row.id,
    scope: row.scope,
    contextKey: row.contextKey,
    name: row.name,
    displayOrder: row.displayOrder,
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
      .orderBy(
        desc(savedBacktests.displayOrder),
        desc(savedBacktests.updatedAt),
        desc(savedBacktests.id),
      )
      .limit(MAX_SAVED_BACKTEST_SCROLL_RECORDS);
    const folderRows = await db
      .select()
      .from(savedBacktestFolders)
      .where(eq(savedBacktestFolders.ownerEmail, ownerEmail))
      .orderBy(
        desc(savedBacktestFolders.displayOrder),
        desc(savedBacktestFolders.id),
      )
      .limit(MAX_SAVED_BACKTEST_FOLDERS);
    return Response.json({
      savedBacktests: rows.map((row) => toRecord(row)),
      savedBacktestFolders: folderRows.map(toFolderRecord),
    });
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
    indicatorConfigurationsJson: JSON.stringify(input.indicators),
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
    const instrumentKey = savedBacktestInstrumentKey(input.instrument);
    const replacementRows = await db
      .select()
      .from(savedBacktests)
      .where(eq(savedBacktests.ownerEmail, ownerEmail))
      .orderBy(desc(savedBacktests.updatedAt), desc(savedBacktests.id))
      .limit(MAX_SAVED_BACKTEST_SCROLL_RECORDS);
    const replacement = replacementRows.find((candidate) =>
      shouldReplaceSavedBacktest(toRecord(candidate), input),
    );
    if (replacement) {
      const [row] = await db
        .update(savedBacktests)
        .set({
          ...values,
          rankHistoryJson: "[]",
          lastRankSnapshotKey: null,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(
            eq(savedBacktests.ownerEmail, ownerEmail),
            eq(savedBacktests.id, replacement.id),
          ),
        )
        .returning();
      return Response.json({
        savedBacktest: toRecord(row),
        replaced: true,
      });
    }
    const [orderRow] = await db
      .select({ value: max(savedBacktests.displayOrder) })
      .from(savedBacktests)
      .where(eq(savedBacktests.ownerEmail, ownerEmail));
    const existingInstrumentRow = replacementRows.find(
      (candidate) =>
        savedBacktestInstrumentKey(rowInstrument(candidate)) === instrumentKey,
    );
    const [row] = await db
      .insert(savedBacktests)
      .values({
        ...values,
        rankHistoryJson: "[]",
        lastRankSnapshotKey: null,
        displayOrder: Number(orderRow?.value ?? 0) + 1,
        instrumentFolderId:
          existingInstrumentRow?.instrumentFolderId ?? null,
      })
      .returning();
    return Response.json(
      { savedBacktest: toRecord(row), replaced: false },
      { status: 201 },
    );
  } catch (error) {
    return persistenceError(error);
  }
}

export async function PATCH(request: Request) {
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
  const input = parseSavedBacktestOrderInput(payload);
  if (!input) {
    return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const db = await getSavedBacktestDb();
    const ownedRows = await db
      .select({ id: savedBacktests.id })
      .from(savedBacktests)
      .where(
        and(
          eq(savedBacktests.ownerEmail, ownerEmail),
          inArray(savedBacktests.id, input.orderedIds),
        ),
      );
    if (ownedRows.length !== input.orderedIds.length) {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const orderCases = input.orderedIds.map((id, index) =>
      sql`WHEN ${id} THEN ${input.orderedIds.length - index}`,
    );
    const displayOrder = sql<number>`CASE ${savedBacktests.id} ${sql.join(
      orderCases,
      sql.raw(" "),
    )} ELSE ${savedBacktests.displayOrder} END`;
    await db
      .update(savedBacktests)
      .set({ displayOrder })
      .where(
        and(
          eq(savedBacktests.ownerEmail, ownerEmail),
          inArray(savedBacktests.id, input.orderedIds),
        ),
      );
    return Response.json({ reordered: true });
  } catch (error) {
    return persistenceError(error);
  }
}

export async function PUT(request: Request) {
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
  const input = parseSavedBacktestRollingUpdateInput(payload);
  if (!input) {
    return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const db = await getSavedBacktestDb();
    const ids = input.evaluations.map((evaluation) => evaluation.id);
    const rows = await db
      .select()
      .from(savedBacktests)
      .where(
        and(
          eq(savedBacktests.ownerEmail, ownerEmail),
          inArray(savedBacktests.id, ids),
        ),
      );
    if (
      rows.length !== ids.length ||
      rows.some(
        (row) =>
          savedBacktestInstrumentKey(rowInstrument(row)) !==
          input.instrumentKey,
      )
    ) {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const returnCases = input.evaluations.map((evaluation) =>
      sql`WHEN ${evaluation.id} THEN ${evaluation.totalReturn}`,
    );
    await db
      .update(savedBacktests)
      .set({
        rollingTotalReturn: sql<number>`CASE ${savedBacktests.id} ${sql.join(
          returnCases,
          sql.raw(" "),
        )} ELSE ${savedBacktests.rollingTotalReturn} END`,
        rollingUpdatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(
        and(
          eq(savedBacktests.ownerEmail, ownerEmail),
          inArray(savedBacktests.id, ids),
        ),
      );
    const updatedRows = await db
      .select()
      .from(savedBacktests)
      .where(
        and(
          eq(savedBacktests.ownerEmail, ownerEmail),
          inArray(savedBacktests.id, ids),
        ),
      );
    const updatedById = new Map(updatedRows.map((row) => [row.id, row]));
    return Response.json({
      rollingUpdates: ids.map((id) => {
        const row = updatedById.get(id);
        if (!row) throw new Error("Updated saved backtest is missing");
        return {
          id: row.id,
          rollingTotalReturn: row.rollingTotalReturn,
        };
      }),
    });
  } catch (error) {
    return persistenceError(error);
  }
}

export async function DELETE(request: Request) {
  const ownerEmail = await resolveOwnerEmail(request);
  if (!ownerEmail) {
    return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const instrumentKey = url.searchParams.get("instrumentKey")?.trim() ?? "";
  if (instrumentKey) {
    if (instrumentKey.length > 128) {
      return Response.json({ error: "INVALID_INSTRUMENT" }, { status: 400 });
    }
    try {
      const db = await getSavedBacktestDb();
      const ownedRows = await db
        .select()
        .from(savedBacktests)
        .where(eq(savedBacktests.ownerEmail, ownerEmail));
      const ids = ownedRows
        .filter(
          (row) =>
            savedBacktestInstrumentKey(rowInstrument(row)) === instrumentKey,
        )
        .map((row) => row.id);
      if (ids.length === 0) {
        return Response.json({ error: "NOT_FOUND" }, { status: 404 });
      }
      const deleteQueries = [];
      for (let index = 0; index < ids.length; index += 100) {
        deleteQueries.push(
          db
          .delete(savedBacktests)
          .where(
            and(
              eq(savedBacktests.ownerEmail, ownerEmail),
              inArray(savedBacktests.id, ids.slice(index, index + 100)),
            ),
          ),
        );
      }
      await db.batch(
        deleteQueries as [
          (typeof deleteQueries)[number],
          ...(typeof deleteQueries),
        ],
      );
      return Response.json({ deleted: true, count: ids.length });
    } catch (error) {
      return persistenceError(error);
    }
  }

  const id = Number(url.searchParams.get("id"));
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
