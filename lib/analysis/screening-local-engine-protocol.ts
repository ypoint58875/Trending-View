import type { BacktestSettings } from "./backtest";
import type { ScreeningObjective } from "./screening";
import type { CombinationScreeningProgress } from "./strategy-combinations";
import type {
  ScreeningValidationConfig,
  ScreeningValidationErrorCode,
  ScreeningValidationOutcome,
  ScreeningValidationProgress,
} from "./screening-validation";
import type { MovingAverageSlopeFilter } from "./entry-filter";
import type { StrategyId } from "./strategies";
import type { MarketBar, MarketInterval } from "@/lib/market/types";

export const LOCAL_SCREENING_ENGINE_VERSION = 1;
export const LOCAL_SCREENING_ENGINE_URL = "http://127.0.0.1:3001";

export interface LocalScreeningJobRequest {
  version: typeof LOCAL_SCREENING_ENGINE_VERSION;
  bars: MarketBar[];
  settings: Omit<BacktestSettings, "interval" | "executionContext"> & {
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

export interface LocalScreeningJobSnapshot {
  jobId: string;
  status: "queued" | "running" | "completed" | "error" | "cancelled";
  progress?: CombinationScreeningProgress;
  validationProgress?: ScreeningValidationProgress;
  outcome?: ScreeningValidationOutcome;
  error?: {
    code?: ScreeningValidationErrorCode;
    message: string;
  };
}

export type LocalScreeningChildEvent =
  | { type: "optimization-progress"; progress: CombinationScreeningProgress }
  | { type: "validation-progress"; progress: ScreeningValidationProgress }
  | { type: "restart" }
  | { type: "completed" }
  | {
      type: "error";
      code?: ScreeningValidationErrorCode;
      message: string;
    };
