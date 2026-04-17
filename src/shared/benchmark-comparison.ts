export type FlowSelectionMode = "random" | "deterministic";

export type DeterministicStartOffsetStrategy = "none" | "per-vu";

export function getDeterministicFlowStartIndex(
  vuId: number,
  flowCount: number,
  strategy: DeterministicStartOffsetStrategy = "none",
): number {
  if (strategy !== "per-vu" || !Number.isFinite(flowCount) || flowCount <= 0) {
    return 0;
  }

  const normalizedVuId =
    Number.isFinite(vuId) && vuId > 0 ? Math.trunc(vuId) - 1 : 0;

  return normalizedVuId % flowCount;
}

export interface ExternalOperationStats {
  name: string;
  requests: number;
  errors: number;
  logicalFailures: number;
  statusCodes: Record<string, number>;
}
