import type { BacktestSettings } from "./backtest";
import type { ScreeningObjective } from "./screening";
import type {
  CombinationScreeningProgress,
} from "./strategy-combinations";
import type {
  ScreeningValidationConfig,
  ScreeningValidationErrorCode,
  ScreeningValidationOutcome,
  ScreeningValidationProgress,
} from "./screening-validation";
import type { MovingAverageSlopeFilter } from "./entry-filter";
import type { StrategyId } from "./strategies";
import type { MarketInterval } from "@/lib/market/types";
import type { PackedMarketBars } from "./screening-worker-bars";

export interface ScreeningWorkerRunRequest {
  type: "run";
  requestId: string;
  bars: PackedMarketBars;
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  };
  config: ScreeningValidationConfig;
  checkpoint: {
    key: string;
    signature: string;
  };
  options: {
    objective?: ScreeningObjective;
    entryFilters?: MovingAverageSlopeFilter[];
    excludedStrategyIds?: StrategyId[];
  };
}

export interface ScreeningWorkerCancelRequest {
  type: "cancel";
  requestId: string;
}

export type ScreeningWorkerRequest =
  | ScreeningWorkerRunRequest
  | ScreeningWorkerCancelRequest;

export type ScreeningWorkerResponse =
  | {
      type: "restart";
      requestId: string;
    }
  | {
      type: "optimization-progress";
      requestId: string;
      progress: CombinationScreeningProgress;
    }
  | {
      type: "validation-progress";
      requestId: string;
      progress: ScreeningValidationProgress;
    }
  | {
      type: "result";
      requestId: string;
      outcome: ScreeningValidationOutcome;
    }
  | {
      type: "error";
      requestId: string;
      code?: ScreeningValidationErrorCode;
      message: string;
    };
