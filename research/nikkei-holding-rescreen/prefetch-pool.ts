import assert from "node:assert/strict";
import { readFile, rename, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

export function futureCandidates(candidates: number[], committedIndex: number, ahead = 32): number[] {
  // The main runner owns the current date; reserve its immediate next candidate too.
  return candidates.filter(index => index > committedIndex + 1).slice(1, ahead + 1);
}

export async function publishPrefetchedJob(studyData: string, index: number, expectedRequest: unknown): Promise<boolean> {
  assert.ok(Number.isInteger(index) && index >= 0);
  const source = resolve(studyData, "prefetch/jobs", String(index));
  const destination = resolve(studyData, "jobs", String(index));
  const contained = (path: string) => path.toLowerCase().startsWith((resolve(studyData) + sep).toLowerCase());
  assert.ok(contained(source) && contained(destination));
  assert.equal(dirname(source), resolve(studyData, "prefetch/jobs"));
  assert.equal(dirname(destination), resolve(studyData, "jobs"));
  for (const name of ["request.json", "result.json"]) assert.ok((await stat(join(source, name))).size <= 16 * 1024 ** 2);
  assert.deepEqual(JSON.parse(await readFile(join(source, "request.json"), "utf8")), expectedRequest);
  const result = JSON.parse(await readFile(join(source, "result.json"), "utf8"));
  assert.equal(result.cancelled, false); assert.equal(result.failedCount, 0);
  assert.ok(Array.isArray(result.results) && Array.isArray(result.singleResults));
  assert.ok(result.results.length + result.singleResults.length > 0);
  try { await stat(destination); return false; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  try { await rename(source, destination); return true; }
  catch (error) {
    // The main runner may have claimed this date since the preceding existence check.
    try { await stat(destination); return false; }
    catch (probe) { if ((probe as NodeJS.ErrnoException).code !== "ENOENT") throw probe; }
    throw error;
  }
}
