import {
  MISTERT_DEFAULT_BASE_URL,
  MISTERT_MODULE_METADATA,
  MISTERT_OPERATIONS_TEMPLATE,
  MISTERT_SPECIAL_SESSIONS_TEMPLATE,
} from "@/constants/mistert-preset-templates";
import { buildOperationsFromTemplate } from "@/constants/mistert-preset-utils";

export { MISTERT_DEFAULT_BASE_URL, MISTERT_MODULE_METADATA };

/** Quantidade de etapas do fluxo principal MisterT. */
export const MISTERT_OPERATION_COUNT = MISTERT_OPERATIONS_TEMPLATE.length;

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
