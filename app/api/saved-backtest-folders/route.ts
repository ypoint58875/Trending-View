import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { resolveOwnerEmail } from "@/app/api/owner";
import { savedBacktestFolders, savedBacktests } from "@/db/schema";
import {
  MAX_SAVED_BACKTEST_FOLDERS,
  MAX_SAVED_BACKTEST_SCROLL_RECORDS,
  parseAssignSavedBacktestFolderInput,
  parseCreateSavedBacktestFolderInput,
  parseRenameSavedBacktestFolderInput,
  parseSavedBacktestFolderOrderInput,
  savedBacktestInstrumentKey,
  type SavedBacktestFolder,
  type SavedBacktestRecord,
} from "@/lib/analysis/saved-backtests";

export const dynamic = "force-dynamic";

async function getSavedBacktestDb() {
  const { getDb } = await import("@/db");
  return getDb();
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

function rowInstrument(
  row: typeof savedBacktests.$inferSelect,
): SavedBacktestRecord["instrument"] {
  return {
    secid: row.secid,
    code: row.code,
    name: row.name,
    exchange: row.exchange as SavedBacktestRecord["instrument"]["exchange"],
    assetType:
      row.assetType as SavedBacktestRecord["instrument"]["assetType"],
    provider: row.provider as SavedBacktestRecord["instrument"]["provider"],
  };
}

function persistenceError(error: unknown) {
  console.error("Saved backtest folder persistence failed", {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return Response.json(
    { error: "PERSISTENCE_UNAVAILABLE" },
    { status: 500 },
  );
}

async function resolveOwnedFolder(
  ownerEmail: string,
  folderId: number,
) {
  const db = await getSavedBacktestDb();
  const [folder] = await db
    .select()
    .from(savedBacktestFolders)
    .where(
      and(
        eq(savedBacktestFolders.ownerEmail, ownerEmail),
        eq(savedBacktestFolders.id, folderId),
      ),
    )
    .limit(1);
  return folder ?? null;
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
  const input = parseCreateSavedBacktestFolderInput(payload);
  if (!input) {
    return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const db = await getSavedBacktestDb();
    const existing = await db
      .select({ id: savedBacktestFolders.id })
      .from(savedBacktestFolders)
      .where(
        and(
          eq(savedBacktestFolders.ownerEmail, ownerEmail),
          eq(savedBacktestFolders.scope, input.scope),
          eq(savedBacktestFolders.contextKey, input.contextKey),
          eq(savedBacktestFolders.name, input.name),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return Response.json({ error: "FOLDER_NAME_EXISTS" }, { status: 409 });
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(savedBacktestFolders)
      .where(eq(savedBacktestFolders.ownerEmail, ownerEmail));
    if (Number(count) >= MAX_SAVED_BACKTEST_FOLDERS) {
      return Response.json({ error: "FOLDER_LIMIT_REACHED" }, { status: 409 });
    }
    const [orderRow] = await db
      .select({ value: max(savedBacktestFolders.displayOrder) })
      .from(savedBacktestFolders)
      .where(
        and(
          eq(savedBacktestFolders.ownerEmail, ownerEmail),
          eq(savedBacktestFolders.scope, input.scope),
          eq(savedBacktestFolders.contextKey, input.contextKey),
        ),
      );
    const [row] = await db
      .insert(savedBacktestFolders)
      .values({
        ownerEmail,
        scope: input.scope,
        contextKey: input.contextKey,
        name: input.name,
        displayOrder: Number(orderRow?.value ?? 0) + 1,
      })
      .returning();
    return Response.json(
      { folder: toFolderRecord(row) },
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
  const orderInput = parseSavedBacktestFolderOrderInput(payload);
  const renameInput = parseRenameSavedBacktestFolderInput(payload);
  if (!orderInput && !renameInput) {
    return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    if (orderInput) {
      const db = await getSavedBacktestDb();
      const siblingRows = await db
        .select({ id: savedBacktestFolders.id })
        .from(savedBacktestFolders)
        .where(
          and(
            eq(savedBacktestFolders.ownerEmail, ownerEmail),
            eq(savedBacktestFolders.scope, orderInput.scope),
            eq(savedBacktestFolders.contextKey, orderInput.contextKey),
          ),
        );
      const siblingIds = new Set(siblingRows.map((row) => row.id));
      if (
        siblingRows.length !== orderInput.orderedIds.length ||
        orderInput.orderedIds.some((id) => !siblingIds.has(id))
      ) {
        return Response.json({ error: "INVALID_FOLDER_ORDER" }, { status: 400 });
      }
      const orderCases = orderInput.orderedIds.map((id, index) =>
        sql`WHEN ${id} THEN ${orderInput.orderedIds.length - index}`,
      );
      const displayOrder = sql<number>`CASE ${savedBacktestFolders.id} ${sql.join(
        orderCases,
        sql.raw(" "),
      )} ELSE ${savedBacktestFolders.displayOrder} END`;
      await db
        .update(savedBacktestFolders)
        .set({ displayOrder, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(
          and(
            eq(savedBacktestFolders.ownerEmail, ownerEmail),
            inArray(savedBacktestFolders.id, orderInput.orderedIds),
          ),
        );
      return Response.json({ reordered: true });
    }

    const input = renameInput!;
    const folder = await resolveOwnedFolder(ownerEmail, input.id);
    if (!folder) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    const db = await getSavedBacktestDb();
    const duplicate = await db
      .select({ id: savedBacktestFolders.id })
      .from(savedBacktestFolders)
      .where(
        and(
          eq(savedBacktestFolders.ownerEmail, ownerEmail),
          eq(savedBacktestFolders.scope, folder.scope),
          eq(savedBacktestFolders.contextKey, folder.contextKey),
          eq(savedBacktestFolders.name, input.name),
        ),
      )
      .limit(1);
    if (duplicate.some((candidate) => candidate.id !== input.id)) {
      return Response.json({ error: "FOLDER_NAME_EXISTS" }, { status: 409 });
    }
    const [row] = await db
      .update(savedBacktestFolders)
      .set({ name: input.name, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(
        and(
          eq(savedBacktestFolders.ownerEmail, ownerEmail),
          eq(savedBacktestFolders.id, input.id),
        ),
      )
      .returning();
    return Response.json({ folder: toFolderRecord(row) });
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
  const input = parseAssignSavedBacktestFolderInput(payload);
  if (!input) {
    return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const folder =
      input.folderId === null
        ? null
        : await resolveOwnedFolder(ownerEmail, input.folderId);
    if (
      input.folderId !== null &&
      (!folder || folder.scope !== input.scope)
    ) {
      return Response.json({ error: "INVALID_FOLDER" }, { status: 400 });
    }
    const db = await getSavedBacktestDb();
    if (input.scope === "instrument") {
      if (folder && folder.contextKey !== "root") {
        return Response.json({ error: "INVALID_FOLDER" }, { status: 400 });
      }
      const rows = await db
        .select()
        .from(savedBacktests)
        .where(eq(savedBacktests.ownerEmail, ownerEmail))
        .orderBy(desc(savedBacktests.displayOrder), desc(savedBacktests.id))
        .limit(MAX_SAVED_BACKTEST_SCROLL_RECORDS);
      const ids = rows
        .filter(
          (row) =>
            savedBacktestInstrumentKey(rowInstrument(row)) ===
            input.instrumentKey,
        )
        .map((row) => row.id);
      if (ids.length === 0) {
        return Response.json({ error: "NOT_FOUND" }, { status: 404 });
      }
      await db
        .update(savedBacktests)
        .set({ instrumentFolderId: input.folderId })
        .where(
          and(
            eq(savedBacktests.ownerEmail, ownerEmail),
            inArray(savedBacktests.id, ids),
          ),
        );
      return Response.json({ assignedIds: ids });
    }

    const [saved] = await db
      .select()
      .from(savedBacktests)
      .where(
        and(
          eq(savedBacktests.ownerEmail, ownerEmail),
          eq(savedBacktests.id, input.savedBacktestId),
        ),
      )
      .limit(1);
    if (!saved) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    if (
      folder &&
      folder.contextKey !== savedBacktestInstrumentKey(rowInstrument(saved))
    ) {
      return Response.json({ error: "INVALID_FOLDER" }, { status: 400 });
    }
    await db
      .update(savedBacktests)
      .set({ strategyFolderId: input.folderId })
      .where(
        and(
          eq(savedBacktests.ownerEmail, ownerEmail),
          eq(savedBacktests.id, input.savedBacktestId),
        ),
      );
    return Response.json({ assignedIds: [input.savedBacktestId] });
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
    const clearInstrumentAssignments = db
      .update(savedBacktests)
      .set({ instrumentFolderId: null })
      .where(
        and(
          eq(savedBacktests.ownerEmail, ownerEmail),
          eq(savedBacktests.instrumentFolderId, id),
        ),
      );
    const clearStrategyAssignments = db
      .update(savedBacktests)
      .set({ strategyFolderId: null })
      .where(
        and(
          eq(savedBacktests.ownerEmail, ownerEmail),
          eq(savedBacktests.strategyFolderId, id),
        ),
      );
    const deleteFolder = db
      .delete(savedBacktestFolders)
      .where(
        and(
          eq(savedBacktestFolders.ownerEmail, ownerEmail),
          eq(savedBacktestFolders.id, id),
        ),
      )
      .returning({ id: savedBacktestFolders.id });
    const [, , rows] = await db.batch([
      clearInstrumentAssignments,
      clearStrategyAssignments,
      deleteFolder,
    ]);
    if (rows.length === 0) {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return Response.json({ deleted: true });
  } catch (error) {
    return persistenceError(error);
  }
}
