# Two-Layer Positioning Implementation Plan

## 1. Lock the new contracts with tests

- Replace core/maximum truth tables with explicit A/B cases.
- Cover positive bounded A/B screening pairs and progress totals.
- Cover new saved JSON plus old-plan conversion.
- Update rendered UI contracts for the shortcut action and independent
  combination controls.

## 2. Refactor the pure strategy-plan model

- Replace core/maximum fields with long/short allocations.
- Build zero, A, and A+B targets with role and bounds validation.
- Preserve live guidance and chart rebalance markers.
- Preserve following-open execution for every historical close-derived
  position change.
- Select following-open target execution for every user-facing historical
  strategy, including rules with internal price-order references.
- Add a tested Shanghai-time 15:00 cutoff for the live execution label.

## 3. Refactor combination optimization

- Add the deterministic A/B candidate pairs.
- Run every candidate through the allocation backtest.
- Return A and B on every ranked result.

## 4. Update persistence compatibility

- Write explicit A/B plan JSON.
- Convert existing core/maximum JSON during parsing.
- Keep legacy primary-strategy rows and the D1 schema compatible.

## 5. Update the workspace

- Move the save action into the shortcut panel.
- Rename the single-strategy screen.
- Add independent combination objective and parameter-cap state and controls.
- Replace lab and result allocation controls with A/B values.

## 6. Update project memory

- Update product, architecture, function, debugging, linkage, shared-pattern,
  decision, changelog, and state documentation.

## 7. Verify and integrate

- Run focused tests, the complete test/build suite, ESLint, and diff checks.
- Verify save, A/B optimization, Apply-to-chart, and responsive behavior in a
  local browser.
- Commit in the isolated worktree, fast-forward `main`, preserve the user's
  `AGENTS.md`, and keep the loopback application ready.
