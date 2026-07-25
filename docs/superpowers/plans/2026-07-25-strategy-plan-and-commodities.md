# Strategy Plan and Commodity Support Implementation Plan

## 1. Add failing analysis and market tests

- Extend horizon/combination tests with allocation-candidate expectations.
- Add pure optional-plan target and current-allocation guidance tests.
- Add allocation-marker tests.
- Add Yahoo `FUTURE` and deterministic commodity-catalog tests.
- Extend saved-backtest validation tests for plans, commodities, and legacy
  compatibility.

## 2. Generalize the strategy plan

- Add strategy-selection and allocation-plan types.
- Validate roles, optional selections, and core/maximum bounds.
- Build targets for dual-, long-only, short-only, and empty plans.
- Add current target-allocation guidance.
- Extend hierarchical targets with maximum allocation.

## 3. Optimize holdings

- Replace fixed core allocation in combination optimization with the
  deterministic six-value ladder.
- Include allocation in total work, results, tie-breaking inputs, and progress.
- Add holding-mode helpers for UI copy selection.

## 4. Project allocation activity to the chart

- Convert allocation rebalances into buy, sell, and range-end markers.
- Allow the price chart to accept explicit markers.
- Allow multiple strategy visual configurations and horizon-specific legend
  prefixes.

## 5. Refactor the strategy lab

- Replace the single strategy state with optional long/short selections and
  separate parameter state.
- Add core and maximum allocation inputs.
- Select the hybrid single engine only for one strategy at full allocation;
  otherwise use the allocation plan engine.
- Adapt metrics, stability availability, live guidance, chart overlays, and
  save behavior.
- Add Apply to every combination row and fill the complete lab plan.

## 6. Persist complete plans

- Add nullable `strategy_plan_json` to the D1 schema and generate a migration.
- Extend payload validation and record mapping.
- Derive a full-allocation single plan for legacy rows.
- Update shortcut summary and restore behavior.

## 7. Add commodity discovery and history

- Add `commodity` to normalized market types and route validation.
- Add the deterministic Yahoo commodity catalog.
- Accept Yahoo `FUTURE` search results and skip Nasdaq fallback for them.
- Add localized Chinese aliases and commodity risk copy.
- Update saved payload validation.

## 8. Update UI styling and rendered contracts

- Style dual selectors, parameter blocks, allocation controls, holding-mode
  result cells, and Apply actions.
- Keep the combination table horizontally contained.
- Update server-render tests for dual selectors, optional values, position
  optimization copy, Apply, and commodity scope.

## 9. Update project memory and traceability

- Update README, architecture, functions, debugging, feature map, module
  patterns, decisions, changelog, Codex state, data sources, data pipeline, and
  cache policy.
- Append a machine-readable Yahoo commodity access record.

## 10. Verify and integrate

- Run focused tests during implementation.
- Generate and apply the local D1 migration in an isolated persistence path.
- Run `npm test`, `npm run lint`, and `git diff --check`.
- Verify live gold and silver daily history.
- Verify Apply, optional horizons, allocation controls, and commodity search
  in a real local browser at desktop and 760-pixel widths.
- Commit in the isolated worktree, fast-forward `main`, preserve the user's
  existing `AGENTS.md`, and confirm the running loopback app serves the new UI.
