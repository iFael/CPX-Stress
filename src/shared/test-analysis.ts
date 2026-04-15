interface LatencyShape {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

interface HealthScoreResultShape {
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  totalBytes: number;
  statusCodes: Record<string, number>;
  latency: LatencyShape;
}

export type MeasurementReliabilityLevel =
  | "high"
  | "degraded"
  | "generator-saturated";

export interface MeasurementReliabilitySignals {
  steadyStateCv: number;
  latencyGrowthFactor: number;
  throughputDropPercent: number;
  timeoutErrors: number;
  connectionErrors: number;
  durationOverrunSeconds: number;
  usedReservoirSampling: boolean;
}

export interface MeasurementReliability {
  level: MeasurementReliabilityLevel;
  summary: string;
  warnings: string[];
  signals: MeasurementReliabilitySignals;
  window?: {
    fullyReliableUntilSecond?: number;
    influencedFromSecond?: number;
    reason: string;
    detail: string;
  };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function calculateHttpErrorRate(result: HealthScoreResultShape): number {
  const httpErrorCount = Object.entries(result.statusCodes || {})
    .filter(([code]) => code === "403" || code === "429" || Number(code) >= 500)
    .reduce((sum, [, count]) => sum + count, 0);

  return result.totalRequests > 0
    ? (httpErrorCount / result.totalRequests) * 100
    : 0;
}

export function calculateHealthScore(result: HealthScoreResultShape): number {
  const httpErrorRate = calculateHttpErrorRate(result);

  if (
    result.errorRate >= 95 ||
    (result.totalRequests === result.totalErrors && result.latency.avg === 0)
  ) {
    return 0;
  }

  if (httpErrorRate >= 90) {
    return 5;
  }

  let score = 100;

  if (result.errorRate > 50) score -= 60;
  else if (result.errorRate > 20) score -= 40;
  else if (result.errorRate > 5) score -= 25;
  else if (result.errorRate > 1) score -= 15;
  else if (result.errorRate > 0.5) score -= 5;

  if (httpErrorRate > 50) score -= 40;
  else if (httpErrorRate > 20) score -= 25;
  else if (httpErrorRate > 5) score -= 10;

  if (result.totalBytes === 0 && result.totalRequests > 0) score -= 30;

  if (result.latency.p95 > 10000) score -= 30;
  else if (result.latency.p95 > 5000) score -= 20;
  else if (result.latency.p95 > 2000) score -= 15;
  else if (result.latency.p95 > 1000) score -= 10;
  else if (result.latency.p95 > 500) score -= 5;

  const disparity =
    result.latency.p50 > 0 ? result.latency.p99 / result.latency.p50 : 1;
  if (disparity > 20) score -= 15;
  else if (disparity > 10) score -= 10;
  else if (disparity > 5) score -= 5;

  return Math.max(0, Math.min(100, score));
}

export function getMeasurementReliabilityMeta(
  reliability?: MeasurementReliability,
): {
  label: string;
  color: string;
  bg: string;
  border: string;
} {
  if (!reliability || reliability.level === "high") {
    return {
      label: "Alta",
      color: "text-sf-success",
      bg: "bg-sf-success/10",
      border: "border-sf-success/30",
    };
  }

  if (reliability.level === "degraded") {
    return {
      label: "Degradada",
      color: "text-sf-warning",
      bg: "bg-sf-warning/10",
      border: "border-sf-warning/30",
    };
  }

  return {
    label: "Gerador saturado",
    color: "text-sf-danger",
    bg: "bg-sf-danger/10",
    border: "border-sf-danger/30",
  };
}
