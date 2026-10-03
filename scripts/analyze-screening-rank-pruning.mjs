import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { deserialize } from "node:v8";

const DEFAULT_STATE_ROOT = join("data", "state", "screening-engine");
const THRESHOLDS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];
const STRATEGY_SLOTS = "ABCDEFGHI".split("");
const OBJECTIVE_TOLERANCE = 1e-9;

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function finiteOrNegativeInfinity(value) {
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function objectiveValue(result, objective) {
  if (objective === "totalReturn") return finiteOrNegativeInfinity(result.totalReturn);
  if (objective === "sharpe") return finiteOrNegativeInfinity(result.sharpe);
  return finiteOrNegativeInfinity(result.score);
}

function compareResults(left, right, objective) {
  const keys = [
    objective === "balanced" ? "score" : objective,
    "totalReturn",
    "maxDrawdown",
    "sharpe",
    "score",
  ];
  for (const key of keys) {
    const leftValue = finiteOrNegativeInfinity(left[key]);
    const rightValue = finiteOrNegativeInfinity(right[key]);
    if (leftValue !== rightValue) return leftValue > rightValue ? -1 : 1;
  }
  return 0;
}

function quantile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function round(value, digits = 6) {
  if (value === null || !Number.isFinite(value)) return value;
  return Number(value.toFixed(digits));
}

function strategyIds(result) {
  return STRATEGY_SLOTS.map((slot) => result[`strategy${slot}Id`]).filter(Boolean);
}

function readCheckpointSection(checkpointDirectory, manifest, section) {
  const filename = manifest.sections?.[section];
  if (!filename) return null;
  return deserialize(readFileSync(join(checkpointDirectory, filename)));
}

function collectObservations(stateRoot) {
  const observations = [];
  const jobs = new Map();
  const skipped = {
    missingSections: 0,
    unreadable: 0,
    noCompletedCombinationResults: 0,
    incompleteStandaloneRanking: 0,
  };
  let checkpointCount = 0;

  for (const entry of readdirSync(stateRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("batch-")) continue;
    const checkpointDirectory = join(stateRoot, entry.name, "checkpoint");
    const manifestPath = join(checkpointDirectory, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    checkpointCount += 1;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (!manifest.sections?.finalists || !manifest.sections?.results) {
        skipped.missingSections += 1;
        continue;
      }
      const signature = JSON.parse(manifest.signature);
      const objective = signature.objective ?? "balanced";
      const finalists = readCheckpointSection(
        checkpointDirectory,
        manifest,
        "finalists",
      );
      const results = readCheckpointSection(checkpointDirectory, manifest, "results");
      if (!Array.isArray(finalists) || finalists.length < 50) {
        skipped.incompleteStandaloneRanking += 1;
        continue;
      }
      if (!Array.isArray(results) || results.length === 0) {
        skipped.noCompletedCombinationResults += 1;
        continue;
      }

      const rankedStrategies = finalists
        .map(([strategyId, strategyFinalists]) => ({
          strategyId,
          result: strategyFinalists?.[0]?.result,
        }))
        .filter(({ result }) => Boolean(result))
        .sort((left, right) => compareResults(left.result, right.result, objective));
      const rankByStrategy = new Map(
        rankedStrategies.map(({ strategyId }, index) => [strategyId, index + 1]),
      );
      const groupedResults = new Map();
      for (const result of results) {
        const count = strategyIds(result).length;
        if (count < 2 || count > 6) continue;
        const group = groupedResults.get(count) ?? [];
        group.push(result);
        groupedResults.set(count, group);
      }

      jobs.set(entry.name, {
        strategyCount: rankedStrategies.length,
        objective,
      });
      for (const [combinationSize, group] of groupedResults) {
        group.sort((left, right) => compareResults(left, right, objective));
        observations.push({
          jobId: entry.name,
          objective,
          combinationSize,
          standaloneStrategyCount: rankedStrategies.length,
          results: group.map((result) => ({
            objectiveValue: objectiveValue(result, objective),
            maximumComponentRank: Math.max(
              ...strategyIds(result).map(
                (strategyId) => rankByStrategy.get(strategyId) ?? Number.POSITIVE_INFINITY,
              ),
            ),
          })),
        });
      }
    } catch {
      skipped.unreadable += 1;
    }
  }

  return { checkpointCount, jobs, observations, skipped };
}

function summarizeThreshold(observations, jobs, threshold) {
  let available = 0;
  let exactWinner = 0;
  let objectiveEquivalent = 0;
  const objectiveLosses = [];
  const replacementRanks = [];

  for (const observation of observations) {
    const retainedCount = Math.ceil(
      (observation.standaloneStrategyCount * threshold) / 100,
    );
    const replacementIndex = observation.results.findIndex(
      (result) => result.maximumComponentRank <= retainedCount,
    );
    if (replacementIndex < 0) continue;
    available += 1;
    replacementRanks.push(replacementIndex + 1);
    if (replacementIndex === 0) exactWinner += 1;
    const loss = Math.max(
      0,
      observation.results[0].objectiveValue -
        observation.results[replacementIndex].objectiveValue,
    );
    objectiveLosses.push(loss);
    if (loss <= OBJECTIVE_TOLERANCE) objectiveEquivalent += 1;
  }

  const pairSpaceReductions = [...jobs.values()].map(({ strategyCount }) => {
    const retainedCount = Math.ceil((strategyCount * threshold) / 100);
    if (strategyCount < 2) return 0;
    return (
      1 -
      (retainedCount * (retainedCount - 1)) /
        (strategyCount * (strategyCount - 1))
    );
  });

  return {
    thresholdPercent: threshold,
    retainedStrategiesFor57: Math.ceil((57 * threshold) / 100),
    alternativeAvailabilityRate: round(available / observations.length),
    exactWinnerPreservationRate: round(exactWinner / observations.length),
    objectiveEquivalentRate: round(objectiveEquivalent / observations.length),
    medianReplacementRank: quantile(replacementRanks, 0.5),
    p90ReplacementRank: quantile(replacementRanks, 0.9),
    medianObjectiveLoss: round(quantile(objectiveLosses, 0.5)),
    p90ObjectiveLoss: round(quantile(objectiveLosses, 0.9)),
    worstObjectiveLoss: round(quantile(objectiveLosses, 1)),
    meanTheoreticalPairSpaceReduction: round(
      pairSpaceReductions.reduce((sum, value) => sum + value, 0) /
        pairSpaceReductions.length,
    ),
  };
}

function buildReport(stateRoot) {
  const { checkpointCount, jobs, observations, skipped } =
    collectObservations(stateRoot);
  if (observations.length === 0) {
    throw new Error(`No complete rank/result checkpoint pairs found under ${stateRoot}`);
  }
  const thresholds = THRESHOLDS.map((threshold) =>
    summarizeThreshold(observations, jobs, threshold),
  );
  const recommended = thresholds.find(
    (summary) =>
      summary.alternativeAvailabilityRate === 1 &&
      summary.objectiveEquivalentRate === 1 &&
      summary.worstObjectiveLoss <= OBJECTIVE_TOLERANCE,
  );
  const winnerMaximumRanks = observations.map(
    ({ results }) => results[0].maximumComponentRank,
  );
  const objectiveCounts = {};
  const sizeCounts = {};
  for (const observation of observations) {
    objectiveCounts[observation.objective] =
      (objectiveCounts[observation.objective] ?? 0) + 1;
    sizeCounts[observation.combinationSize] =
      (sizeCounts[observation.combinationSize] ?? 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    source: stateRoot,
    methodology: {
      ranking:
        "Rank each strategy family by its best retained standalone result using the production objective and tie-break order.",
      coverage:
        "A combination survives x% only when every component strategy family is inside ceil(strategyCount * x%).",
      loss:
        "Compare the original category winner with the first surviving stored top-30 result under the same objective.",
      scope:
        "Completed checkpoint generations with at least 50 standalone families and stored two- through six-strategy results.",
    },
    sample: {
      checkpointCount,
      usableJobCount: jobs.size,
      combinationCategoryCount: observations.length,
      objectiveCounts,
      categoryCountsByCombinationSize: sizeCounts,
      skipped,
    },
    winnerMaximumComponentRank: {
      median: quantile(winnerMaximumRanks, 0.5),
      p90: quantile(winnerMaximumRanks, 0.9),
      maximum: quantile(winnerMaximumRanks, 1),
    },
    thresholds,
    recommendation: recommended
      ? {
          thresholdPercent: recommended.thresholdPercent,
          rationale:
            "This is the smallest tested threshold with a stored eligible alternative and zero observed objective loss in every category.",
          limitation:
            "The threshold is empirical, the complete sample uses total-return jobs, and pair-space reduction overstates end-to-end savings because standalone screening remains exhaustive.",
        }
      : {
          thresholdPercent: 100,
          rationale:
            "No tested pruning threshold preserved an eligible objective-equivalent result in every category.",
        },
  };
}

const stateRoot = argumentValue("--root") ?? DEFAULT_STATE_ROOT;
const report = buildReport(stateRoot);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
