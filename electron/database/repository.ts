/**
 * Repository — Camada de acesso a dados para o StressFlow.
 *
 * Encapsula todas as operações de banco de dados (CRUD + queries).
 * Usa prepared statements para seguranca (prevencao de SQL injection)
 * e performance (reutilizacao de planos de execução).
 */

import { getDatabase } from "./database";
import type Database from "better-sqlite3";

// ============================================================================
// Tipos internos para o repositório
// ============================================================================

export interface TestResultRow {
  id: string;
  url: string;
  config_json: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  total_requests: number;
  total_errors: number;
  rps: number;
  latency_avg: number | null;
  latency_min: number | null;
  latency_p50: number | null;
  latency_p90: number | null;
  latency_p95: number | null;
  latency_p99: number | null;
  latency_max: number | null;
  error_rate: number;
  throughput_bytes_per_sec: number | null;
  total_bytes: number | null;
  status_codes_json: string;
  timeline_json: string;
  status: string;
  error_message: string | null;
  protection_report_json: string | null;
  operation_metrics_json: string | null;
  error_breakdown_json: string | null;
  created_at: string;
}

export interface ErrorRow {
  id: string;
  test_id: string;
  timestamp: number;
  operation_name: string;
  status_code: number;
  error_type: string;
  message: string;
  response_snippet: string | null;
}

// ============================================================================
// Tipos de Preset
// ============================================================================

export interface PresetRow {
  id: string;
  name: string;
  config_json: string;
  is_builtin: number; // SQLite INTEGER para boolean (0 ou 1)
  builtin_version: number | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// TestResult CRUD
// ============================================================================

/** Converte uma row do SQLite para o formato TestResult do app. */
function rowToTestResult(row: TestResultRow) {
  return {
    id: row.id,
    url: row.url,
    config: JSON.parse(row.config_json),
    startTime: row.start_time,
    endTime: row.end_time,
    durationSeconds: row.duration_seconds,
    totalRequests: row.total_requests,
    totalErrors: row.total_errors,
    rps: row.rps,
    latency: {
      avg: row.latency_avg ?? 0,
      min: row.latency_min ?? 0,
      p50: row.latency_p50 ?? 0,
      p90: row.latency_p90 ?? 0,
      p95: row.latency_p95 ?? 0,
      p99: row.latency_p99 ?? 0,
      max: row.latency_max ?? 0,
    },
    errorRate: row.error_rate,
    throughputBytesPerSec: row.throughput_bytes_per_sec ?? 0,
    totalBytes: row.total_bytes ?? 0,
    statusCodes: JSON.parse(row.status_codes_json || "{}"),
    timeline: JSON.parse(row.timeline_json || "[]"),
    status: row.status as "completed" | "cancelled" | "error",
    errorMessage: row.error_message ?? undefined,
    protectionReport: row.protection_report_json
      ? JSON.parse(row.protection_report_json)
      : undefined,
    operationMetrics: row.operation_metrics_json
      ? JSON.parse(row.operation_metrics_json)
      : undefined,
    errorBreakdown: row.error_breakdown_json
      ? JSON.parse(row.error_breakdown_json)
      : undefined,
  };
}

/** Salva um resultado de teste no banco. */
export function saveTestResult(result: Record<string, unknown>): void {
  const db = getDatabase();
  const r = result as Record<string, unknown>;

  const latency = r.latency as Record<string, number> | undefined;

  db.prepare(
    `
    INSERT OR REPLACE INTO test_results (
      id, url, config_json, start_time, end_time, duration_seconds,
      total_requests, total_errors, rps, latency_avg, latency_min,
      latency_p50, latency_p90, latency_p95, latency_p99, latency_max,
      error_rate, throughput_bytes_per_sec, total_bytes, status_codes_json,
      timeline_json, status, error_message, protection_report_json,
      operation_metrics_json, error_breakdown_json, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `,
  ).run(
    r.id as string,
    r.url as string,
    JSON.stringify(r.config || {}),
    r.startTime as string,
    r.endTime as string,
    r.durationSeconds as number,
    r.totalRequests as number,
    r.totalErrors as number,
    r.rps as number,
    latency?.avg ?? null,
    latency?.min ?? null,
    latency?.p50 ?? null,
    latency?.p90 ?? null,
    latency?.p95 ?? null,
    latency?.p99 ?? null,
    latency?.max ?? null,
    r.errorRate as number,
    (r.throughputBytesPerSec as number) ?? null,
    (r.totalBytes as number) ?? null,
    JSON.stringify(r.statusCodes || {}),
    JSON.stringify(r.timeline || []),
    r.status as string,
    (r.errorMessage as string) || null,
    r.protectionReport ? JSON.stringify(r.protectionReport) : null,
    r.operationMetrics ? JSON.stringify(r.operationMetrics) : null,
    r.errorBreakdown ? JSON.stringify(r.errorBreakdown) : null,
    (r.startTime as string) || new Date().toISOString(),
  );
}

/** Lista todos os resultados de testes ordenados por data (mais recente primeiro). */
export function listTestResults(limit = 100): Record<string, unknown>[] {
  const db = getDatabase();
  const rows = db
    .prepare("SELECT * FROM test_results ORDER BY created_at DESC LIMIT ?")
    .all(limit) as TestResultRow[];

  return rows.map(rowToTestResult);
}

/** Busca um resultado de teste por ID. */
export function getTestResult(id: string): Record<string, unknown> | null {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM test_results WHERE id = ?").get(id) as
    | TestResultRow
    | undefined;

  return row ? rowToTestResult(row) : null;
}

/** Remove um resultado de teste por ID (cascade deleta erros associados). */
export function deleteTestResult(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare("DELETE FROM test_results WHERE id = ?").run(id);
  return result.changes > 0;
}

/** Remove todos os resultados de testes. */
export function clearTestResults(): void {
  const db = getDatabase();
  db.exec("DELETE FROM test_results");
  db.exec("DELETE FROM test_errors");
}

// ============================================================================
// ErrorRecord CRUD
// ============================================================================

/** Limite máximo de erros individuais por teste. */
const MAX_ERRORS_PER_TEST = 10_000;

/** Salva um lote de erros de uma vez (batch insert transacional). */
export function saveErrorBatch(errors: ErrorRow[]): void {
  if (errors.length === 0) return;

  const db = getDatabase();

  // Verificar limite por teste
  const testId = errors[0].test_id;
  const existing = db
    .prepare("SELECT COUNT(*) as c FROM test_errors WHERE test_id = ?")
    .get(testId) as { c: number };

  const remaining = MAX_ERRORS_PER_TEST - existing.c;
  if (remaining <= 0) return;

  const toInsert = errors.slice(0, remaining);

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO test_errors (
      id, test_id, timestamp, operation_name, status_code,
      error_type, message, response_snippet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const e of toInsert) {
      stmt.run(
        e.id,
        e.test_id,
        e.timestamp,
        e.operation_name,
        e.status_code,
        e.error_type,
        e.message,
        e.response_snippet || null,
      );
    }
  })();
}

/** Busca erros com filtros opcionais (paginado). */
export function searchErrors(params: {
  testId?: string;
  statusCode?: number;
  errorType?: string;
  limit?: number;
  offset?: number;
}): { records: ErrorRow[]; total: number } {
  const db = getDatabase();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.testId) {
    conditions.push("test_id = ?");
    values.push(params.testId);
  }
  if (params.statusCode !== undefined && params.statusCode !== null) {
    conditions.push("status_code = ?");
    values.push(params.statusCode);
  }
  if (params.errorType) {
    conditions.push("error_type = ?");
    values.push(params.errorType);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(params.limit || 50, 500);
  const offset = params.offset || 0;

  const total = db
    .prepare(`SELECT COUNT(*) as c FROM test_errors ${where}`)
    .get(...values) as { c: number };

  const records = db
    .prepare(
      `SELECT * FROM test_errors ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    )
    .all(...values, limit, offset) as ErrorRow[];

  return { records, total: total.c };
}

/** Retorna contagem de erros agrupados por status code para um teste. */
export function getErrorsByStatusCode(testId: string): Record<string, number> {
  const db = getDatabase();
  const rows = db
    .prepare(
      "SELECT status_code, COUNT(*) as count FROM test_errors WHERE test_id = ? GROUP BY status_code ORDER BY count DESC",
    )
    .all(testId) as Array<{ status_code: number; count: number }>;

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[String(row.status_code)] = row.count;
  }
  return result;
}

/** Retorna contagem de erros agrupados por tipo para um teste. */
export function getErrorsByType(testId: string): Record<string, number> {
  const db = getDatabase();
  const rows = db
    .prepare(
      "SELECT error_type, COUNT(*) as count FROM test_errors WHERE test_id = ? GROUP BY error_type ORDER BY count DESC",
    )
    .all(testId) as Array<{ error_type: string; count: number }>;

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.error_type] = row.count;
  }
  return result;
}

// ============================================================================
// Preset CRUD
// ============================================================================

/** Limite maximo de tamanho do config_json em bytes (1 MB). */
const MAX_CONFIG_JSON_SIZE = 1_048_576;

/** Converte uma row do SQLite para o formato TestPreset do renderer. */
function rowToPreset(row: PresetRow) {
  return {
    id: row.id,
    name: row.name,
    config: JSON.parse(row.config_json),
    isBuiltin: row.is_builtin === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Lista todos os presets ordenados: built-in primeiro, depois por nome. */
export function listPresets() {
  const db = getDatabase();
  const rows = db
    .prepare("SELECT * FROM test_presets ORDER BY is_builtin DESC, name ASC")
    .all() as PresetRow[];

  return rows.map(rowToPreset);
}

/**
 * Salva um preset (insert ou update).
 * Se id e fornecido e existe no banco: atualiza (rejeita se built-in).
 * Se id nao e fornecido ou nao existe: insere novo.
 * Retorna o preset salvo.
 */
export function savePreset(data: {
  id?: string;
  name: string;
  configJson: string;
}): ReturnType<typeof rowToPreset> {
  const db = getDatabase();

  // Validacoes
  if (!data.name || data.name.trim().length === 0) {
    throw new Error("Informe um nome para o preset.");
  }
  if (data.name.trim().length > 100) {
    throw new Error("O nome do preset deve ter no maximo 100 caracteres.");
  }
  if (!data.configJson || data.configJson.length > MAX_CONFIG_JSON_SIZE) {
    throw new Error("A configuracao do preset excede o tamanho maximo permitido.");
  }

  // Validar que o JSON e parseavel
  try {
    JSON.parse(data.configJson);
  } catch {
    throw new Error("A configuracao do preset contem JSON invalido.");
  }

  if (data.id) {
    // Verificar se o preset existe
    const existing = db
      .prepare("SELECT is_builtin FROM test_presets WHERE id = ?")
      .get(data.id) as { is_builtin: number } | undefined;

    if (existing) {
      // Update existente
      if (existing.is_builtin === 1) {
        throw new Error("Presets built-in nao podem ser alterados.");
      }
      db.prepare(
        `UPDATE test_presets
         SET name = ?, config_json = ?, updated_at = datetime('now')
         WHERE id = ? AND is_builtin = 0`
      ).run(data.name.trim(), data.configJson, data.id);

      const updated = db
        .prepare("SELECT * FROM test_presets WHERE id = ?")
        .get(data.id) as PresetRow;
      return rowToPreset(updated);
    }
  }

  // Insert novo preset
  const { v4: uuidv4 } = require("uuid") as typeof import("uuid");
  const id = data.id || uuidv4();

  db.prepare(
    `INSERT INTO test_presets (id, name, config_json, is_builtin, created_at, updated_at)
     VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))`
  ).run(id, data.name.trim(), data.configJson);

  const inserted = db
    .prepare("SELECT * FROM test_presets WHERE id = ?")
    .get(id) as PresetRow;
  return rowToPreset(inserted);
}

/** Renomeia um preset do usuario. Rejeita built-in. */
export function renamePreset(id: string, newName: string): void {
  const db = getDatabase();

  if (!newName || newName.trim().length === 0) {
    throw new Error("Informe um nome para o preset.");
  }
  if (newName.trim().length > 100) {
    throw new Error("O nome do preset deve ter no maximo 100 caracteres.");
  }

  const existing = db
    .prepare("SELECT is_builtin FROM test_presets WHERE id = ?")
    .get(id) as { is_builtin: number } | undefined;

  if (!existing) {
    throw new Error("Preset nao encontrado.");
  }
  if (existing.is_builtin === 1) {
    throw new Error("Presets built-in nao podem ser renomeados.");
  }

  db.prepare(
    `UPDATE test_presets
     SET name = ?, updated_at = datetime('now')
     WHERE id = ? AND is_builtin = 0`
  ).run(newName.trim(), id);
}

/** Deleta um preset do usuario. Rejeita built-in. */
export function deletePreset(id: string): void {
  const db = getDatabase();

  const existing = db
    .prepare("SELECT is_builtin FROM test_presets WHERE id = ?")
    .get(id) as { is_builtin: number } | undefined;

  if (!existing) {
    throw new Error("Preset nao encontrado.");
  }
  if (existing.is_builtin === 1) {
    throw new Error("Presets built-in nao podem ser excluidos.");
  }

  db.prepare("DELETE FROM test_presets WHERE id = ? AND is_builtin = 0").run(id);
}
