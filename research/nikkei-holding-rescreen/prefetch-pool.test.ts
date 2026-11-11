import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { futureCandidates, publishPrefetchedJob } from "./prefetch-pool";
const request = { barCount: 101, settings: { startTime: "2024-01-01", endTime: "2024-01-15" }, checkpoint: { signature: "causal-prefix-fixture" } };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "quantscope-prefetch-"));
  const source = join(root, "prefetch/jobs/100");
  await mkdir(source, { recursive: true }); await mkdir(join(root, "jobs"));
  await writeFile(join(source, "request.json"), JSON.stringify(request));
  await writeFile(join(source, "result.json"), JSON.stringify({ cancelled: false, failedCount: 0, results: [{ fixture: true }], singleResults: [] }));
  return { root, source, destination: join(root, "jobs/100") };
}
async function cleanup(path: string) {
  assert.ok(resolve(path).startsWith(resolve(tmpdir()) + sep));
  await rm(path, { recursive: true, force: true });
}
test("lookahead reserves current and next candidate, stays bounded and never schedules past dates", () => {
  assert.deepEqual(futureCandidates([95, 100, 101, 103, 108, 109, 120], 100, 2), [108, 109]);
  assert.deepEqual(futureCandidates([95, 100], 100), []);
});
test("only a complete matching job is published atomically with unchanged result bytes", async () => {
  const f = await fixture();
  try {
    const bytes = await readFile(join(f.source, "result.json"));
    assert.equal(await publishPrefetchedJob(f.root, 100, request), true);
    assert.deepEqual(await readFile(join(f.destination, "result.json")), bytes);
    await assert.rejects(stat(f.source), { code: "ENOENT" });
  } finally { await cleanup(f.root); }
});
test("main-runner ownership and mismatching/incomplete requests cannot be overwritten", async () => {
  const f = await fixture();
  try {
    await assert.rejects(publishPrefetchedJob(f.root, 100, { ...request, barCount: 102 }));
    await mkdir(f.destination); await writeFile(join(f.destination, "owner.txt"), "main-runner");
    assert.equal(await publishPrefetchedJob(f.root, 100, request), false);
    assert.equal(await readFile(join(f.destination, "owner.txt"), "utf8"), "main-runner");
    assert.ok(await stat(f.source));
    await writeFile(join(f.source, "result.json"), JSON.stringify({ cancelled: true, failedCount: 0, results: [], singleResults: [] }));
    await assert.rejects(publishPrefetchedJob(f.root, 100, request));
    assert.equal(await readFile(join(f.destination, "owner.txt"), "utf8"), "main-runner");
  } finally { await cleanup(f.root); }
});
