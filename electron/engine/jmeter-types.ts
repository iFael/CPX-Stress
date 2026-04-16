export interface JMeterConfig {
  url: string;
  vus: number;
  duration: number;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  flowOperations?: JMeterFlowOperation[];
  rampUpSeconds?: number;
}

export interface JMeterFlowOperation {
  name: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  moduleGroup?: string;
  extractors?: Array<{
    varName: string;
    regex: string;
  }>;
  expectedTexts?: string[];
  rejectLoginLikeContent?: boolean;
  rejectTexts?: string[];
}

export interface JMeterSummary {
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
}

export type JMeterStatus = "idle" | "running" | "done" | "error";
