import {
  MISTERT_DEFAULT_BASE_URL,
  MISTERT_MODULE_METADATA,
  MISTERT_OPERATIONS_TEMPLATE,
  MISTERT_SPECIAL_SESSIONS_TEMPLATE,
} from "@/constants/mistert-preset-templates";
import { buildOperationsFromTemplate } from "@/constants/mistert-preset-utils";
import type {
  DeterministicStartOffsetStrategy,
  FlowSelectionMode,
  TestConfig,
} from "@/types";

export { MISTERT_DEFAULT_BASE_URL, MISTERT_MODULE_METADATA };

export const DEFAULT_PRESET_FLOW_SELECTION_MODE: FlowSelectionMode = "random";
export const DEFAULT_PRESET_DETERMINISTIC_START_OFFSET_STRATEGY: DeterministicStartOffsetStrategy =
  "none";
export const DEFAULT_PRESET_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_PRESET_RAMP_UP = 0;

const MISTERT_MODULE_BY_NAME = new Map(
  MISTERT_MODULE_METADATA.map((module) => [module.name, module]),
) as Map<string, (typeof MISTERT_MODULE_METADATA)[number]>;
const MISTERT_MODULE_BY_OPERATION_NAME = new Map(
  MISTERT_MODULE_METADATA.flatMap((module) =>
    module.operationNames.map((operationName) => [operationName, module] as const),
  ),
 ) as Map<string, (typeof MISTERT_MODULE_METADATA)[number]>;

export const MISTERT_MODULE_OPERATION_NAMES = new Set<string>(
  [...MISTERT_MODULE_BY_OPERATION_NAME.keys()],
);

/** Quantidade de etapas do fluxo principal MisterT. */
export const MISTERT_OPERATION_COUNT = MISTERT_OPERATIONS_TEMPLATE.length;

export function getMistertModuleByName(moduleName: string) {
  return MISTERT_MODULE_BY_NAME.get(moduleName);
}

export function getMistertModuleByOperationName(operationName: string) {
  return MISTERT_MODULE_BY_OPERATION_NAME.get(operationName);
}

export function isMistertModuleOperationName(operationName: string): boolean {
  return MISTERT_MODULE_OPERATION_NAMES.has(operationName);
}

/**
 * Retorna uma cópia profunda das operações do fluxo principal MisterT.
 *
 * @param baseUrl URL base do ambiente MisterT (sem barra final).
 *                Quando omitido, usa o ambiente padrão de desenvolvimento.
 */
export function buildMistertOperations(baseUrl?: string) {
  return buildOperationsFromTemplate(
    MISTERT_OPERATIONS_TEMPLATE,
    MISTERT_DEFAULT_BASE_URL,
    baseUrl,
  );
}

/**
 * Retorna um fluxo de referência para páginas action-driven do MisterT.
 * Útil para investigações e para futuros presets especializados.
 */
export function buildMistertSpecialSessionsOperations(baseUrl?: string) {
  return buildOperationsFromTemplate(
    MISTERT_SPECIAL_SESSIONS_TEMPLATE,
    MISTERT_DEFAULT_BASE_URL,
    baseUrl,
  );
}

export function normalizePresetConfig(config: TestConfig): TestConfig {
  return {
    ...config,
    flowSelectionMode:
      config.flowSelectionMode ?? DEFAULT_PRESET_FLOW_SELECTION_MODE,
    deterministicStartOffsetStrategy:
      config.deterministicStartOffsetStrategy ??
      DEFAULT_PRESET_DETERMINISTIC_START_OFFSET_STRATEGY,
    requestTimeoutMs:
      config.requestTimeoutMs ?? DEFAULT_PRESET_REQUEST_TIMEOUT_MS,
    rampUp: config.rampUp ?? DEFAULT_PRESET_RAMP_UP,
  };
}

export function formatFlowSelectionModeLabel(
  flowSelectionMode?: FlowSelectionMode,
): string {
  return (flowSelectionMode ?? DEFAULT_PRESET_FLOW_SELECTION_MODE) === "deterministic"
    ? "Determinístico"
    : "Aleatório";
}

export function formatPresetTimeoutLabel(requestTimeoutMs?: number): string {
  const resolvedTimeout =
    requestTimeoutMs ?? DEFAULT_PRESET_REQUEST_TIMEOUT_MS;
  return `${resolvedTimeout.toLocaleString("pt-BR")} ms`;
}

export function formatRampUpLabel(rampUp?: number): string {
  const resolvedRampUp = rampUp ?? DEFAULT_PRESET_RAMP_UP;
  return `Ramp-up ${resolvedRampUp}s`;
}
