export interface StrategyPriceOrders {
  entryStop: number | null;
  exitStop: number | null;
  entryAtOpen?: boolean;
  exitAtOpen?: boolean;
}

export type StrategyOrderSeries = StrategyPriceOrders[];

export function emptyOrderSeries(length: number): StrategyOrderSeries {
  return Array.from({ length }, () => ({
    entryStop: null,
    exitStop: null,
  }));
}
