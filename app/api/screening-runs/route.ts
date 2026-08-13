import { and, desc, eq, sql } from "drizzle-orm";
import { resolveOwnerEmail } from "@/app/api/owner";
import { screeningRuns } from "@/db/schema";
import {
  MAX_SCREENING_RUN_HISTORY,
  parseSaveScreeningRunInput,
  type ScreeningRunRecord,
} from "@/lib/analysis/screening-runs";

export const dynamic = "force-dynamic";

type ScreeningRunRow = typeof screeningRuns.$inferSelect;
async function getScreeningRunDb() {
  const { getDb } = await import("@/db");
  return getDb();
}

async function pruneScreeningRunHistory(
  db: Awaited<ReturnType<typeof getScreeningRunDb>>,
  ownerEmail: string,
) {
  await db.run(sql`
    DELETE FROM ${screeningRuns}
    WHERE ${screeningRuns.ownerEmail} = ${ownerEmail}
      AND ${screeningRuns.id} IN (
        SELECT run_id
        FROM (
          SELECT
            ${screeningRuns.id} AS run_id,
            ROW_NUMBER() OVER (
              PARTITION BY ${screeningRuns.instrumentKey}
              ORDER BY ${screeningRuns.createdAt} DESC, ${screeningRuns.id} DESC
            ) AS history_rank
          FROM ${screeningRuns}
          WHERE ${screeningRuns.ownerEmail} = ${ownerEmail}
        ) AS ranked_screening_runs
        WHERE history_rank > ${MAX_SCREENING_RUN_HISTORY}
      )
  `);
}

function toRecord(row: ScreeningRunRow): ScreeningRunRecord {
  const input = parseSaveScreeningRunInput({
    instrument: {
      secid: row.secid,
      code: row.code,
      name: row.name,
      exchange: row.exchange,
      assetType: row.assetType,
      provider: row.provider,
    },
    instrumentKey: row.instrumentKey,
    interval: row.interval,
    source: row.source,
    priceAdjustment: row.priceAdjustment,
    fetchedAt: row.fetchedAt,
    lastBarDate: row.lastBarDate,
    barCount: row.barCount,
    dataFingerprint: row.dataFingerprint,
    temporaryQuote:
      row.temporaryQuoteProvider &&
      row.temporaryQuoteDate &&
      row.temporaryQuoteFetchedAt
        ? {
            provider: row.temporaryQuoteProvider,
            time: row.temporaryQuoteDate,
            fetchedAt: row.temporaryQuoteFetchedAt,
          }
        : null,
    validationMode: row.validationMode,
    validationConfig: JSON.parse(row.validationConfigJson) as unknown,
    objective: row.objective,
    settings: JSON.parse(row.settingsJson) as unknown,
    candidates: JSON.parse(row.candidatesJson) as unknown,
    selectedCandidateKey: row.selectedCandidateKey,
    validationReport: row.validationReportJson
      ? (JSON.parse(row.validationReportJson) as unknown)
      : null,
  });
  if (!input) throw new Error("Stored screening run is invalid");
  return {
    id: row.id,
    ...input,
    createdAt: row.createdAt,
  };
}

function persistenceError(error: unknown) {
  console.error("Screening run persistence failed", {
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
  const url = new URL(request.url);
  const instrumentKey = url.searchParams.get("instrumentKey")?.trim() ?? "";
  const requestedLimit = Number(
    url.searchParams.get("limit") ?? MAX_SCREENING_RUN_HISTORY,
  );
  const limit = Math.min(
    Math.max(
      Number.isInteger(requestedLimit)
        ? requestedLimit
        : MAX_SCREENING_RUN_HISTORY,
      1,
    ),
    MAX_SCREENING_RUN_HISTORY,
  );
  if (!instrumentKey || instrumentKey.length > 128) {
    return Response.json({ error: "INVALID_INSTRUMENT" }, { status: 400 });
  }

  try {
    const db = await getScreeningRunDb();
    await pruneScreeningRunHistory(db, ownerEmail);
    const rows = await db
      .select()
      .from(screeningRuns)
      .where(
        and(
          eq(screeningRuns.ownerEmail, ownerEmail),
          eq(screeningRuns.instrumentKey, instrumentKey),
        ),
      )
      .orderBy(desc(screeningRuns.createdAt), desc(screeningRuns.id))
      .limit(limit);
    return Response.json({ screeningRuns: rows.map(toRecord) });
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
  const input = parseSaveScreeningRunInput(payload);
  if (!input) {
    return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }
  const candidatesJson = JSON.stringify(input.candidates);
  if (candidatesJson.length > 1_000_000) {
    return Response.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  try {
    const db = await getScreeningRunDb();
    const previousRows = await db
      .select()
      .from(screeningRuns)
      .where(
        and(
          eq(screeningRuns.ownerEmail, ownerEmail),
          eq(screeningRuns.instrumentKey, input.instrumentKey),
        ),
      )
      .orderBy(desc(screeningRuns.createdAt), desc(screeningRuns.id))
      .limit(1);
    const previousRow = previousRows[0];
    const insertedRows = await db
      .insert(screeningRuns)
      .values({
        ownerEmail,
        instrumentKey: input.instrumentKey,
        secid: input.instrument.secid,
        code: input.instrument.code,
        name: input.instrument.name,
        exchange: input.instrument.exchange,
        assetType: input.instrument.assetType,
        provider: input.instrument.provider,
        source: input.source,
        interval: input.interval,
        priceAdjustment: input.priceAdjustment,
        fetchedAt: input.fetchedAt,
        lastBarDate: input.lastBarDate,
        barCount: input.barCount,
        dataFingerprint: input.dataFingerprint,
        temporaryQuoteProvider:
          input.temporaryQuote?.provider ?? null,
        temporaryQuoteDate: input.temporaryQuote?.time ?? null,
        temporaryQuoteFetchedAt:
          input.temporaryQuote?.fetchedAt ?? null,
        validationMode: input.validationMode,
        validationConfigJson: JSON.stringify(input.validationConfig),
        objective: input.objective,
        settingsJson: JSON.stringify(input.settings),
        candidatesJson,
        selectedCandidateKey: input.selectedCandidateKey,
        validationReportJson: input.validationReport
          ? JSON.stringify(input.validationReport)
          : null,
      })
      .returning();
    const row = insertedRows[0];
    if (!row) {
      throw new Error("Screening run insert returned no row");
    }
    try {
      await pruneScreeningRunHistory(db, ownerEmail);
    } catch (error) {
      console.error("Screening run pruning failed", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
    return Response.json(
      {
        screeningRun: toRecord(row),
        previousRun: previousRow ? toRecord(previousRow) : null,
      },
      { status: 201 },
    );
  } catch (error) {
    return persistenceError(error);
  }
}
