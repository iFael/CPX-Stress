import type {
  ExternalOperationStats,
  FlowSelectionMode,
} from "../../src/shared/benchmark-comparison";

export interface K6Config {
  url: string;
  vus: number;
  duration: number;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  flowSelectionMode?: FlowSelectionMode;
  headers?: Record<string, string>;
  body?: string;
  flowOperations?: K6FlowOperation[];
}

export interface K6FlowOperation {
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

export interface K6Summary {
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
  executable?: string;
  version?: string;
  artifactsDir?: string;
  scriptPath?: string;
  stdoutSnippet?: string;
  stderrSnippet?: string;
  operationStats?: Record<string, ExternalOperationStats>;
}

export type K6Status = "idle" | "running" | "done" | "error";
