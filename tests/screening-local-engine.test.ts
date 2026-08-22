import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { serialize } from "node:v8";
import { runScreeningWithValidation } from "../lib/analysis/screening-validation";
import type { LocalScreeningJobRequest } from "../lib/analysis/screening-local-engine-protocol";
import { STRATEGIES } from "../lib/analysis/strategies";
import { packMarketBars } from "../lib/analysis/screening-worker-bars";
import type { MarketBar } from "../lib/market/types";

function makeBars(length: number): MarketBar[] {
  let previousClose = 100;
  return Array.from({ length }, (_, index) => {
    const time = new Date(Date.UTC(2025, 0, index + 1))
      .toISOString()
      .slice(0, 10);
    const open = previousClose;
    const close = open + Math.sin(index / 7) * 1.8 + 0.15;
    previousClose = close;
    return {
      time,
      timestamp: Date.parse(`${time}T00:00:00Z`),
      open,
      high: Math.max(open, close) + 0.8,
      low: Math.min(open, close) - 0.8,
      close,
      volume: 10_000 + index,
      amount: close * (10_000 + index),
      amplitude: 1,
      changePercent: ((close - open) / open) * 100,
      change: close - open,
      turnoverRate: 1,
    };
  });
}

function runChildOnce(jobDirectory: string): Promise<number | null> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("scripts/screening-engine-child.ts"),
        jobDirectory,
      ],
      { cwd: resolve("."), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || code === 75) resolvePromise(code);
      else reject(new Error(stderr || `Screening child exited with ${code}`));
    });
  });
}

async function runChild(jobDirectory: string): Promise<number> {
  let restarts = 0;
  while (true) {
    const code = await runChildOnce(jobDirectory);
    if (code === 0) return restarts;
    restarts += 1;
    assert.ok(restarts < 100, "screening child restart loop did not converge");
  }
}

test("local screening child matches the shared in-process screening core", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quantscope-screening-"));
  const bars = makeBars(160);
  const excludedStrategyIds = STRATEGIES.filter(
    (strategy) => strategy.id !== "sma-cross",
  ).map((strategy) => strategy.id);
  const request: LocalScreeningJobRequest = {
    version: 2,
    bars,
    settings: {
      initialCash: 100_000,
      commissionRate: 0.0003,
      slippageRate: 0.0002,
      interval: "1d",
      executionPolicy: "next-open",
    },
    config: { mode: "sample", periods: [{ sessions: 128, weight: 100 }] },
    checkpoint: { key: "test", signature: "deterministic-test" },
    options: { objective: "totalReturn", excludedStrategyIds },
  };
  try {
    await writeFile(
      join(directory, "request.json"),
      JSON.stringify({ ...request, bars: undefined }),
    );
    await writeFile(
      join(directory, "bars.bin"),
      serialize(packMarketBars(request.bars)),
    );
    const expected = await runScreeningWithValidation(
      request.bars,
      request.settings,
      request.config,
      request.options,
    );
    const restarts = await runChild(directory);
    assert.ok(restarts > 0, "test must exercise disk-checkpoint continuation");
    const actual = JSON.parse(
      await readFile(join(directory, "result.json"), "utf8"),
    );
    assert.deepEqual(actual, JSON.parse(JSON.stringify(expected)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
