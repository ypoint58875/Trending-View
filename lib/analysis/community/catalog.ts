export type CommunityAnalysisKind = "indicator" | "strategy";

export interface CommunityAnalysisCatalogItem {
  id: string;
  kind: CommunityAnalysisKind;
  displayName: string;
  sourceFile: string;
  sourcePlatform: "TradingView";
  license: "MPL-2.0" | "CC-BY-NC-SA-4.0" | "author-terms" | "unspecified";
  compatibility: "formula-port" | "adapted";
  causality: "close-confirmed" | "confirmed-pivots";
  notes: readonly string[];
}

// This catalog is the stable intake boundary for downloaded community scripts.
// Source text stays outside the repository; only independently maintained,
// typed implementations are registered in the application.
export const COMMUNITY_ANALYSIS_CATALOG = [
  {
    id: "adaptiveRegressionBreakout",
    kind: "indicator",
    displayName: "Adaptive Regression Breakout Map",
    sourceFile: "Adaptive Regression Breakout Map.txt",
    sourcePlatform: "TradingView",
    license: "MPL-2.0",
    compatibility: "adapted",
    causality: "close-confirmed",
    notes: ["Uses causal endpoint regression and confirmation-bar breakout markers; decorative pivot trendlines are omitted."],
  },
  {
    id: "autoAtrTrendTracker",
    kind: "indicator",
    displayName: "Auto-ATR Volatility Spike & Trend Tracker",
    sourceFile: "Auto-ATR Volatility Spike & Trend Tracker.txt",
    sourcePlatform: "TradingView",
    license: "CC-BY-NC-SA-4.0",
    compatibility: "formula-port",
    causality: "close-confirmed",
    notes: ["Ports the default Auto ATR and candle-body mode."],
  },
  {
    id: "fractionalEmaKalman",
    kind: "indicator",
    displayName: "Fractional EMA Kalman Filter",
    sourceFile: "Fractional EMA Kalman Filter.txt",
    sourcePlatform: "TradingView",
    license: "MPL-2.0",
    compatibility: "formula-port",
    causality: "close-confirmed",
    notes: ["Keeps separate baseline and fast adaptive Kalman paths."],
  },
  {
    id: "nadarayaWatsonTrend",
    kind: "indicator",
    displayName: "Nadaraya-Watson Trend",
    sourceFile: "Nadaraya-Watson Trend .txt",
    sourcePlatform: "TradingView",
    license: "CC-BY-NC-SA-4.0",
    compatibility: "formula-port",
    causality: "close-confirmed",
    notes: ["Uses the default causal endpoint Gaussian kernel and residual bands."],
  },
  {
    id: "rsiDivergenceEngine",
    kind: "indicator",
    displayName: "RSI Divergence Entry Engine",
    sourceFile: "RSI Divergence Entry Engine.txt",
    sourcePlatform: "TradingView",
    license: "unspecified",
    compatibility: "adapted",
    causality: "confirmed-pivots",
    notes: ["Shows regular divergence on the confirmation bar; hidden and MTF filters are omitted."],
  },
  {
    id: "squeezeMomentum",
    kind: "indicator",
    displayName: "Squeeze Momentum Indicator",
    sourceFile: "Squeeze Momentum Indicator [LazyBear].txt",
    sourcePlatform: "TradingView",
    license: "author-terms",
    compatibility: "formula-port",
    causality: "close-confirmed",
    notes: ["Honors the exposed Bollinger multiplier instead of the downloaded script's unused input bug."],
  },
  {
    id: "supportResistanceSignals",
    kind: "indicator",
    displayName: "Support and Resistance Signals MTF",
    sourceFile: "Support and Resistance Signals MTF.txt",
    sourcePlatform: "TradingView",
    license: "CC-BY-NC-SA-4.0",
    compatibility: "adapted",
    causality: "confirmed-pivots",
    notes: ["Runs on the chart timeframe; MTF aggregation and decorative zones are omitted."],
  },
  {
    id: "trendlineBreaks",
    kind: "indicator",
    displayName: "Trendlines with Breaks",
    sourceFile: "Trendlines with Breaks [LuxAlgo].txt",
    sourcePlatform: "TradingView",
    license: "CC-BY-NC-SA-4.0",
    compatibility: "adapted",
    causality: "confirmed-pivots",
    notes: ["Uses the ATR slope method without backpainting."],
  },
  {
    id: "waveTrend",
    kind: "indicator",
    displayName: "WaveTrend with Crosses",
    sourceFile: "WaveTrend.txt",
    sourcePlatform: "TradingView",
    license: "author-terms",
    compatibility: "formula-port",
    causality: "close-confirmed",
    notes: ["Ports WT1, WT2, and their difference."],
  },
  {
    id: "community-bollinger-rsi",
    kind: "strategy",
    displayName: "Bollinger + RSI Double Strategy",
    sourceFile: "Bollinger + RSI, Double Strategy (by ChartArt).txt",
    sourcePlatform: "TradingView",
    license: "unspecified",
    compatibility: "adapted",
    causality: "close-confirmed",
    notes: ["Long-only adaptation; close-confirmed signals execute from the next bar open."],
  },
  {
    id: "community-squeeze-momentum",
    kind: "strategy",
    displayName: "Squeeze Momentum Strategy",
    sourceFile: "'Squeeze Momentum Indicator Strategy [LazyBear + PineIndicators].txt",
    sourcePlatform: "TradingView",
    license: "unspecified",
    compatibility: "adapted",
    causality: "close-confirmed",
    notes: ["Long-only adaptation of squeeze release and momentum conditions."],
  },
  {
    id: "community-ut-bot",
    kind: "strategy",
    displayName: "UT Bot Alerts Strategy",
    sourceFile: "Strategy for UT Bot Alerts indicator .txt",
    sourcePlatform: "TradingView",
    license: "MPL-2.0",
    compatibility: "adapted",
    causality: "close-confirmed",
    notes: ["Long-only signal core; sizing, leverage, partial exits, and session filters use host backtest settings."],
  },
] as const satisfies readonly CommunityAnalysisCatalogItem[];

export function getCommunityAnalysisCatalogItem(id: string) {
  return COMMUNITY_ANALYSIS_CATALOG.find((item) => item.id === id) ?? null;
}
