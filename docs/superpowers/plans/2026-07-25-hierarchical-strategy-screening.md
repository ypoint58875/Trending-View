# Hierarchical Strategy Screening Implementation Plan

> **For Codex:** Follow the test-driven sequence below. Do not modify
> `AGENTS.md`, market providers, authentication, launchers, D1 schema, or the
> daily-only interval contract.

**Goal:** Classify every strategy as long- or short-horizon and add a bounded
one-click optimizer that combines a long uptrend gate with short-trend
core/full exposure changes.

**Architecture:** Store horizon metadata in the strategy registry. Reuse the
existing parameter spaces and scalar objectives. Add pure hierarchical-target
and allocation-backtest helpers, then add a two-stage finalist optimizer and a
dedicated UI section below single-strategy screening.

**Tech Stack:** TypeScript, React 19, ECharts 6, Vinext/Vite, Node test runner.

---

### Task 1: Lock strategy horizon metadata with tests

**Files:**

- Modify: `tests/analysis.test.ts`
- Modify: `lib/analysis/strategies.ts`

**Steps:**

1. Add tests that every registered strategy has exactly one valid horizon.
2. Assert the expected long and short ID lists are complete and disjoint.
3. Run the focused tests and confirm failure.
4. Add `StrategyHorizon`, registry metadata, ordered horizon ID contracts, and
   a horizon lookup helper.
5. Run the focused tests.

### Task 2: Add hierarchical allocation targets and partial backtesting

**Files:**

- Modify: `tests/analysis.test.ts`
- Modify: `lib/analysis/backtest.ts`
- Create: `lib/analysis/strategy-combinations.ts`

**Steps:**

1. Add target tests for flat, core, and full allocation plus prefix
   invariance.
2. Add allocation-backtest tests for next-open execution, partial rebalances,
   costs, and final liquidation.
3. Run the focused tests and confirm failure.
4. Implement common performance fields and a pure allocation backtest without
   changing single-strategy fill semantics.
5. Implement the hierarchical target builder with a clamped configurable core
   allocation.
6. Run the focused tests.

### Task 3: Add bounded two-stage combination optimization

**Files:**

- Modify: `tests/analysis.test.ts`
- Modify: `lib/analysis/screening.ts`
- Modify: `lib/analysis/strategy-combinations.ts`

**Steps:**

1. Add tests for horizon-filtered candidate generation and two finalists per
   strategy.
2. Add tests for long/short role correctness, deterministic result sorting,
   bounded pair counts, progress completion, and cancellation.
3. Run the focused tests and confirm failure.
4. Expose shared parameter candidates by horizon and structural performance
   objective comparison.
5. Implement chunked two-stage optimization and retain completed results on
   cancellation.
6. Run the focused tests.

### Task 4: Add strategy grouping and combination screening UI

**Files:**

- Modify: `tests/rendered-html.test.mjs`
- Modify: `app/components/BacktestChart.tsx`
- Modify: `app/MarketWorkspace.tsx`
- Modify: `app/i18n/zh-CN.ts`
- Modify: `app/globals.css`

**Steps:**

1. Add render assertions for long/short option groups, horizon labels, and a
   combination section ordered below single-strategy results.
2. Run the rendered test and confirm failure.
3. Group the strategy selector by registry horizon.
4. Add independent combination run/progress/results state and shared reset
   behavior.
5. Add a 30%-90% core-allocation input with a 60% default.
6. Render ranked long/short pairs and automatically preview the first
   combination's equity and drawdown.
7. Generalize `BacktestChart` to the common equity-result shape.
8. Add responsive styles and run render tests.

### Task 5: Update linked project documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/CODEX_STATE.md`
- Modify: `docs/FEATURE_MAP.md`
- Modify: `docs/FUNCTIONS.md`
- Modify: `docs/MODULE_PATTERNS.md`
- Modify: `docs/TECH_RESEARCH.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/DECISIONS.md`
- Add: design and plan files for this feature

**Steps:**

1. Record the explicit horizon contract, hierarchical allocation semantics,
   two-stage bounded search, and combination trade-count meaning.
2. Record the multi-horizon and bounded-optimization research comparison.
3. Link implementation, UI, tests, and product limitations in
   `FEATURE_MAP.md`.
4. Update current state and remaining priorities.

### Task 6: Full verification and integration

**Files:**

- Verify planned files only.

**Steps:**

1. Run `npm test`.
2. Run `npm run lint`.
3. Run `git diff --check` and inspect `git status`/`git diff`.
4. Start the isolated app on an unused loopback port.
5. Verify in a real browser:
   - strategy options are grouped by long and short horizon;
   - single screening remains operational;
   - combination screening appears below it;
   - core allocation can be changed;
   - progress completes and ranked long/short pairs appear;
   - the best combination equity preview renders.
6. Review the entire branch and address validated findings.
7. Re-run all verification.
8. Fast-forward the feature into `main` without touching the user-owned
   `AGENTS.md`.
9. Remove the generated worktree and restart
   `http://127.0.0.1:3000`.
