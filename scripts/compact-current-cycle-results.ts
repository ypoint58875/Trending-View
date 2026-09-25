import { readFile, readdir, realpath, lstat, rm, stat, writeFile } from "node:fs/promises";
import { resolve, join, sep, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compactCycleScreeningOutcome, selectBestShortcutScreeningResult } from "../lib/analysis/shortcut-batch-screening";
import type { ScreeningValidationOutcome } from "../lib/analysis/screening-validation";
import { replaceFileAtomically } from "./atomic-file";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stateRoot = resolve(projectRoot, "data", "state", "screening-engine");
const keepBatch = "batch-e9746526351c7207958a7e7b";
const expectedCount = 356;
const firstDecisionIndex = 6169;
const lastDecisionIndex = 6524;
const maximumResultBytes = 16 * 1024 * 1024;
const jobIdPattern = /^[a-f0-9]{24}$/;
const batchPattern = /^batch-[a-f0-9]{24}$/;

interface JobRequest {
  checkpoint?: { key?: string };
  options?: { objective?: "balanced" | "totalReturn" | "sharpe" };
  sharedBarsPath?: string;
}

function childPath(name: string): string {
  const path = resolve(stateRoot, name);
  if (!path.startsWith(`${stateRoot}${sep}`) || basename(path) !== name) {
    throw new Error(`Path escapes screening state: ${name}`);
  }
  return path;
}

async function checkedDirectory(name: string): Promise<string> {
  const path = childPath(name);
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`Unexpected screening state entry: ${name}`);
  }
  const actual = await realpath(path);
  if (actual !== path) throw new Error(`Resolved path differs: ${name}`);
  return path;
}

async function inspect() {
  const batchDirectory = await checkedDirectory(keepBatch);
  const manifest = JSON.parse(await readFile(join(batchDirectory, "queue.json"), "utf8")) as {
    version?: number;
    jobIds?: string[];
  };
  const keepIds = manifest.jobIds ?? [];
  if (
    manifest.version !== 1 || keepIds.length !== expectedCount ||
    new Set(keepIds).size !== expectedCount ||
    keepIds.some((id) => !jobIdPattern.test(id))
  ) throw new Error("Current batch does not contain exactly 356 unique jobs");

  const decisions: number[] = [];
  let originalResultBytes = 0;
  for (const id of keepIds) {
    const directory = await checkedDirectory(id);
    const request = JSON.parse(await readFile(join(directory, "request.json"), "utf8")) as JobRequest;
    const match = request.checkpoint?.key?.match(/^screening:cycle:index:N225:(\d+):128$/);
    if (
      !match || request.options?.objective !== "totalReturn" ||
      request.sharedBarsPath !== join(batchDirectory, "bars.bin")
    ) throw new Error(`Job is not part of the current N225 cycle: ${id}`);
    decisions.push(Number(match[1]));
    const size = (await stat(join(directory, "result.json"))).size;
    if (size <= 0 || size > maximumResultBytes) {
      throw new Error(`Result size is outside the safe bound: ${id}`);
    }
    originalResultBytes += size;
  }
  decisions.sort((left, right) => left - right);
  if (
    decisions[0] !== firstDecisionIndex ||
    decisions.at(-1) !== lastDecisionIndex ||
    decisions.some((value, index) => value !== firstDecisionIndex + index)
  ) throw new Error("The retained decision series is incomplete");

  const entries = await readdir(stateRoot, { withFileTypes: true });
  const otherDirectories = entries.flatMap((entry) => {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(`Unexpected screening state entry: ${entry.name}`);
    }
    if (!jobIdPattern.test(entry.name) && !batchPattern.test(entry.name)) {
      throw new Error(`Unknown screening state directory: ${entry.name}`);
    }
    return entry.name === keepBatch || keepIds.includes(entry.name) ? [] : [entry.name];
  });
  const otherJobIds = otherDirectories.filter((name) => jobIdPattern.test(name));
  return { keepIds, otherDirectories, otherJobIds, originalResultBytes };
}

async function compactJob(id: string): Promise<{ before: number; after: number; changed: boolean }> {
  const resultPath = join(childPath(id), "result.json");
  const raw = await readFile(resultPath, "utf8");
  if (Buffer.byteLength(raw) > maximumResultBytes) throw new Error(`Result grew past bound: ${id}`);
  const original = JSON.parse(raw) as ScreeningValidationOutcome;
  const originalWinner = selectBestShortcutScreeningResult(
    original.singleResults,
    original.results,
    "totalReturn",
  );
  if (!originalWinner) throw new Error(`Result has no winner: ${id}`);
  const compact = compactCycleScreeningOutcome(original, "totalReturn");
  const compactWinner = selectBestShortcutScreeningResult(
    compact.singleResults,
    compact.results,
    "totalReturn",
  );
  if (JSON.stringify(compactWinner) !== JSON.stringify(originalWinner)) {
    throw new Error(`Winner changed during compaction: ${id}`);
  }
  const encoded = JSON.stringify(compact);
  if (encoded === raw) return { before: Buffer.byteLength(raw), after: Buffer.byteLength(raw), changed: false };
  const temporaryPath = `${resultPath}.compact-${process.pid}.tmp`;
  await writeFile(temporaryPath, encoded, { flag: "wx" });
  try {
    await replaceFileAtomically(temporaryPath, resultPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  const published = JSON.parse(await readFile(resultPath, "utf8")) as ScreeningValidationOutcome;
  if (
    published.singleResults.length + published.results.length !== 1 ||
    JSON.stringify(selectBestShortcutScreeningResult(
      published.singleResults, published.results, "totalReturn",
    )) !== JSON.stringify(originalWinner)
  ) throw new Error(`Published result failed verification: ${id}`);
  return { before: Buffer.byteLength(raw), after: Buffer.byteLength(encoded), changed: true };
}

async function coordinatorRequest(path: string, jobIds: string[]) {
  const response = await fetch(`http://127.0.0.1:3001${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: 6, jobIds }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Coordinator ${path} returned ${response.status}`);
  return response.json() as Promise<{ jobs?: Array<{ status: string; jobId: string }> }>;
}

async function cancelUnfinishedJobs(jobIds: string[]) {
  for (let index = 0; index < jobIds.length; index += 256) {
    const chunk = jobIds.slice(index, index + 256);
    const status = await coordinatorRequest("/screening/job-statuses", chunk);
    const unfinished = (status.jobs ?? []).filter((job) =>
      job.status === "queued" || job.status === "running").map((job) => job.jobId);
    if (unfinished.length) await coordinatorRequest("/screening/job-cancellations", unfinished);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const oneResult = process.argv.includes("--one-result");
  if (oneResult && !apply) throw new Error("--one-result requires --apply");
  const plan = await inspect();
  console.log(JSON.stringify({
    mode: apply ? oneResult ? "one-result" : "apply" : "dry-run",
    keepBatch, retainedResults: plan.keepIds.length,
    oldResultMiB: +(plan.originalResultBytes / 1048576).toFixed(1),
    otherJobDirectories: plan.otherJobIds.length,
    otherBatchDirectories: plan.otherDirectories.length - plan.otherJobIds.length,
  }));
  if (!apply) return;
  const ids = oneResult ? plan.keepIds.slice(0, 1) : plan.keepIds;
  let changed = 0;
  let savedBytes = 0;
  for (const id of ids) {
    const result = await compactJob(id);
    if (result.changed) changed += 1;
    savedBytes += result.before - result.after;
  }
  console.log(JSON.stringify({ compacted: changed, savedMiB: +(savedBytes / 1048576).toFixed(1) }));
  if (oneResult) return;
  await cancelUnfinishedJobs(plan.otherJobIds);
  for (const name of plan.otherDirectories) {
    const directory = await checkedDirectory(name);
    await rm(directory, { recursive: true, force: false });
  }
  console.log(JSON.stringify({ deletedDirectories: plan.otherDirectories.length }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
