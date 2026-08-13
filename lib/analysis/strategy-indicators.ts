import {
  getDefaultIndicatorParameters,
  getIndicator,
  type IndicatorConfiguration,
  type IndicatorParameters,
} from "./indicator-registry";
import type {
  StrategyAllocationPlan,
  StrategySelection,
} from "./strategy-combinations";
import { getStrategy } from "./strategies";

function linkedConfiguration(
  selection: StrategySelection | null,
): IndicatorConfiguration | null {
  if (!selection) return null;
  const strategy = getStrategy(selection.strategyId);
  if (!strategy.paneIndicatorId) return null;
  const indicator = getIndicator(strategy.paneIndicatorId);
  if (indicator.placement !== "pane") return null;

  const parameters: IndicatorParameters = getDefaultIndicatorParameters(
    indicator.id,
  );
  for (const key of Object.keys(parameters)) {
    const strategyValue = selection.parameters[key];
    if (Number.isFinite(strategyValue)) parameters[key] = strategyValue;
  }
  return { id: indicator.id, parameters };
}

function configurationKey(configuration: IndicatorConfiguration): string {
  return `${configuration.id}:${Object.entries(configuration.parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(",")}`;
}

export function buildStrategyLinkedPaneIndicators(
  plan: StrategyAllocationPlan | null,
): IndicatorConfiguration[] {
  if (!plan) return [];
  const configurations = [
    linkedConfiguration(plan.strategyA),
    linkedConfiguration(plan.strategyB),
  ].filter(
    (configuration): configuration is IndicatorConfiguration =>
      configuration !== null,
  );
  const seen = new Set<string>();
  return configurations.filter((configuration) => {
    const key = configurationKey(configuration);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergeChartIndicatorConfigurations(
  visible: readonly IndicatorConfiguration[],
  linked: readonly IndicatorConfiguration[],
): IndicatorConfiguration[] {
  const seen = new Set<string>();
  return [...visible, ...linked].filter((configuration) => {
    const key = configurationKey(configuration);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
