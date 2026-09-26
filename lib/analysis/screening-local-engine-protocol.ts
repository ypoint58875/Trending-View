import type { BacktestSettings } from "./backtest";
import type { ScreeningObjective } from "./screening";
import type { CombinationScreeningProgress } from "./strategy-combinations";
import type {
  ScreeningValidationConfig,
  ScreeningValidationErrorCode,
  ScreeningValidationProgress,
} from "./screening-validation";
import type { MovingAverageSlopeFilter } from "./entry-filter";
import type { StrategyId } from "./strategies";
import type { MarketBar, MarketInterval } from "@/lib/market/types";

export const LOCAL_SCREENING_ENGINE_VERSION = 7;
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
    maxCombinationStrategies?: number;
  };
}

export interface LocalScreeningJobBatchUnit
  extends Omit<LocalScreeningJobRequest, "bars"> {
  barCount: number;
}

export interface LocalScreeningJobBatchRequest {
  version: typeof LOCAL_SCREENING_ENGINE_VERSION;
  bars: MarketBar[];
  jobs: LocalScreeningJobBatchUnit[];
}

export interface LocalScreeningJobSnapshot {
  jobId: string;
  status: "queued" | "running" | "completed" | "error" | "cancelled";
  progress?: CombinationScreeningProgress;
  validationProgress?: ScreeningValidationProgress;
  engine?: LocalScreeningEngineStatus;
  error?: {
    code?: ScreeningValidationErrorCode;
    message: string;
  };
}

export interface LocalScreeningJobBatchStatus {
  jobId: string;
  status: LocalScreeningJobSnapshot["status"];
  error?: LocalScreeningJobSnapshot["error"];
}

export interface LocalScreeningEngineStatus {
  updatedAt: number;
  restartCount: number;
  evaluationsPerSecond: number;
  estimatedRemainingSeconds: number | null;
  residentBytes: number;
  heapUsedBytes: number;
  elapsedSeconds?: number;
  checkpointBytes?: number;
  checkpointWriteMilliseconds?: number;
}

export type LocalScreeningChildEvent =
  | { type: "optimization-progress"; progress: CombinationScreeningProgress }
  | { type: "validation-progress"; progress: ScreeningValidationProgress }
  | { type: "telemetry"; status: LocalScreeningEngineStatus }
  | { type: "restart" }
  | { type: "completed" }
  | {
      type: "error";
      code?: ScreeningValidationErrorCode;
      message: string;
    };
