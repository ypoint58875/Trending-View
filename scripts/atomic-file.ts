import { rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const RETRYABLE_RENAME_CODES = new Set([
  "EACCES",
  "EBUSY",
  "EEXIST",
  "ENOTEMPTY",
  "EPERM",
]);

export interface AtomicFileOperations {
  rename(source: string, target: string): Promise<void>;
  rm(path: string, options: { force: true }): Promise<void>;
  wait(milliseconds: number): Promise<void>;
}

const defaultOperations: AtomicFileOperations = {
  rename,
  rm: (path, options) => rm(path, options),
  wait: (milliseconds) =>
    new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
};

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
}

async function renameWithRetry(
  source: string,
  target: string,
  operations: AtomicFileOperations,
  attempts: number,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await operations.rename(source, target);
      return;
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_RENAME_CODES.has(errorCode(error) ?? "")) throw error;
      if (attempt + 1 < attempts) {
        await operations.wait(Math.min(10 * 2 ** attempt, 250));
      }
    }
  }
  throw lastError;
}

export async function replaceFileAtomically(
  temporaryPath: string,
  targetPath: string,
  {
    operations = defaultOperations,
    attempts = 8,
  }: {
    operations?: AtomicFileOperations;
    attempts?: number;
  } = {},
): Promise<void> {
  try {
    await renameWithRetry(temporaryPath, targetPath, operations, attempts);
    return;
  } catch (error) {
    if (!RETRYABLE_RENAME_CODES.has(errorCode(error) ?? "")) throw error;
  }

  const backupPath = `${targetPath}.backup-${Date.now()}-${process.pid}-${randomUUID()}`;
  let targetMoved = false;
  try {
    try {
      await renameWithRetry(targetPath, backupPath, operations, attempts);
      targetMoved = true;
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
    await renameWithRetry(temporaryPath, targetPath, operations, attempts);
  } catch (error) {
    if (targetMoved) {
      try {
        await renameWithRetry(backupPath, targetPath, operations, attempts);
        targetMoved = false;
      } catch {
        // Keep the backup for startup recovery if restoration is also blocked.
      }
    }
    throw error;
  }
  if (targetMoved) {
    await operations.rm(backupPath, { force: true }).catch(() => {});
  }
}
