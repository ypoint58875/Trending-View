import type { MarketBar } from "@/lib/market/types";
import type { IndicatorId } from "../indicator-registry";
import { bollingerBands, ema, rsi } from "../indicators";
import { squeezeMomentum, utBotTrail } from "./indicators";

export const COMMUNITY_STRATEGY_IDS = [
  "community-bollinger-rsi",
  "community-squeeze-momentum",
  "community-ut-bot",
] as const;

export type CommunityStrategyId = (typeof COMMUNITY_STRATEGY_IDS)[number];
type StrategyParameters = Record<string, number>;

export interface CommunityStrategyDefinition {
  id: CommunityStrategyId;
  horizon: "long" | "short";
  indicatorId: string;
  paneIndicatorId?: IndicatorId;
  defaultParameters: StrategyParameters;
  buildTarget: (bars: MarketBar[], parameters: StrategyParameters) => number[];
}

function crossedAbove(
  current: number | null,
  previous: number | null,
  currentReference: number | null,
  previousReference: number | null,
) {
  return current !== null && previous !== null && currentReference !== null && previousReference !== null && current > currentReference && previous <= previousReference;
}

function crossedBelow(
  current: number | null,
  previous: number | null,
  currentReference: number | null,
  previousReference: number | null,
) {
  return current !== null && previous !== null && currentReference !== null && previousReference !== null && current < currentReference && previous >= previousReference;
}

function bollingerRsiTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const closes = bars.map((bar) => bar.close);
  const oscillator = rsi(closes, parameters.rsiPeriod);
  const bands = bollingerBands(closes, parameters.bbPeriod, parameters.bbWidth);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 1; index < bars.length; index += 1) {
    const buy = crossedAbove(oscillator[index], oscillator[index - 1], 50, 50) && crossedAbove(closes[index], closes[index - 1], bands.lower[index], bands.lower[index - 1]);
    const sell = crossedBelow(oscillator[index], oscillator[index - 1], 50, 50) && crossedBelow(closes[index], closes[index - 1], bands.upper[index], bands.upper[index - 1]);
    if (!invested && buy) invested = true;
    else if (invested && sell) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function squeezeMomentumTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const values = squeezeMomentum(
    bars,
    parameters.bbPeriod,
    parameters.bbWidth,
    parameters.kcPeriod,
    parameters.kcWidth,
  );
  const closes = bars.map((bar) => bar.close);
  const trend = ema(closes, parameters.trendPeriod);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 1; index < bars.length; index += 1) {
    const currentMomentum = values.momentum[index];
    const previousMomentum = values.momentum[index - 1];
    const previousWindow = values.momentum
      .slice(Math.max(0, index - 100), index)
      .filter((value): value is number => value !== null);
    const release = values.squeezeOff[index] && values.squeezeOn[index - 1];
    const entry = release && currentMomentum !== null && previousMomentum !== null && currentMomentum > previousMomentum && currentMomentum > Math.min(...previousWindow, currentMomentum) && closes[index] > closes[index - 1] && trend[index] !== null && closes[index] > trend[index]!;
    const exit = currentMomentum !== null && previousMomentum !== null && currentMomentum < previousMomentum;
    if (!invested && entry) invested = true;
    else if (invested && exit) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function utBotTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const closes = bars.map((bar) => bar.close);
  const trail = utBotTrail(bars, parameters.keyValue, parameters.atrPeriod);
  const trend = ema(closes, parameters.trendPeriod);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 1; index < bars.length; index += 1) {
    const buy = crossedAbove(closes[index], closes[index - 1], trail[index], trail[index - 1]) && trend[index] !== null && closes[index] > trend[index]!;
    const sell = crossedBelow(closes[index], closes[index - 1], trail[index], trail[index - 1]);
    if (!invested && buy) invested = true;
    else if (invested && sell) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

export const COMMUNITY_STRATEGIES: readonly CommunityStrategyDefinition[] = [
  {
    id: "community-bollinger-rsi",
    horizon: "short",
    indicatorId: "bollinger",
    paneIndicatorId: "rsi",
    defaultParameters: { rsiPeriod: 6, bbPeriod: 200, bbWidth: 2 },
    buildTarget: bollingerRsiTarget,
  },
  {
    id: "community-squeeze-momentum",
    horizon: "long",
    indicatorId: "squeezeMomentum",
    paneIndicatorId: "squeezeMomentum",
    defaultParameters: { bbPeriod: 20, bbWidth: 2, kcPeriod: 20, kcWidth: 1.5, trendPeriod: 100 },
    buildTarget: squeezeMomentumTarget,
  },
  {
    id: "community-ut-bot",
    horizon: "long",
    indicatorId: "autoAtrTrendTracker",
    defaultParameters: { keyValue: 3, atrPeriod: 1, trendPeriod: 200 },
    buildTarget: utBotTarget,
  },
];
