export type FlowSelectionMode = "random" | "deterministic";

export interface ExternalOperationStats {
  name: string;
  requests: number;
  errors: number;
  logicalFailures: number;
  statusCodes: Record<string, number>;
}
