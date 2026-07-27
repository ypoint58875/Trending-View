import { and, desc, eq } from "drizzle-orm";
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
  const requestedLimit = Number(url.searchParams.get("limit") ?? 12);
  const limit = Math.min(
    Math.max(
      Number.isInteger(requestedLimit) ? requestedLimit : 12,
      1,
    ),
    MAX_SCREENING_RUN_HISTORY,
  );
  if (!instrumentKey || instrumentKey.length > 128) {
    return Response.json({ error: "INVALID_INSTRUMENT" }, { status: 400 });
  }

  try {
    const db = await getScreeningRunDb();
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
    const [previousRow] = await db
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
    const [row] = await db
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
