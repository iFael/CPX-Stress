import type {
  ExternalOperationStats,
  FlowSelectionMode,
} from "../../src/shared/benchmark-comparison";

export interface LocustConfig {
  url: string;
  vus: number;
  duration: number;
  host?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  flowSelectionMode?: FlowSelectionMode;
  headers?: Record<string, string>;
  body?: string;
  flowOperations?: LocustFlowOperation[];
  spawnRate?: number;
  rampUpSeconds?: number;
}

export interface LocustFlowOperation {
  name: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  moduleGroup?: string;
  captureSession?: boolean;
  extractors?: Array<{
    varName: string;
    regex: string;
  }>;
  expectedTexts?: string[];
  rejectLoginLikeContent?: boolean;
  rejectTexts?: string[];
}

export interface LocustSummary {
  avgLatency: number;
  minLatency: number;
  p50Latency: number;
  p90Latency: number;
  p95Latency: number;
  p99Latency: number;
  maxLatency: number;
  rps: number;
  totalReqs: number;
  errorRate: number;
  statusCodes: Record<string, number>;
  duration: number;
  vus: number;
  totalBytes?: number;
  throughputBytesPerSec?: number;
  executable?: string;
  version?: string;
  artifactsDir?: string;
  scriptPath?: string;
  stdoutSnippet?: string;
  stderrSnippet?: string;
  operationStats?: Record<string, ExternalOperationStats>;
}

export type LocustStatus = "idle" | "running" | "done" | "error";
