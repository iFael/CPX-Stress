/**
 * Repository — Camada de acesso a dados para o CPX-Stress.
 *
 * Encapsula todas as operações de banco de dados (CRUD + queries).
 * Usa prepared statements para seguranca (prevencao de SQL injection)
 * e performance (reutilizacao de planos de execução).
 */

import { getDatabase } from "./database";
import { v4 as uuidv4 } from "uuid";
import type Database from "better-sqlite3";
import type {
  PersistedExternalBenchmarks,
  SecondMetrics,
  TestConfig,
  TestResult,
} from "../engine/stress-engine";

// ============================================================================
// Utilitários internos
// ============================================================================

/** JSON.parse seguro — retorna fallback se o JSON estiver corrompido. */
function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    console.warn("[CPX-Stress] JSON corrompido no banco de dados, usando fallback.");
    return fallback;
  }
}

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
  vu_results_json: string | null;
  measurement_reliability_json: string | null;
  operational_warnings_json: string | null;
  error_breakdown_json: string | null;
  external_benchmarks_json: string | null;
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
function rowToTestResult(row: TestResultRow): TestResult {
  return {
    id: row.id,
    url: row.url,
    config: safeJsonParse<TestConfig>(row.config_json, {
      url: row.url,
      virtualUsers: 0,
      duration: 0,
      method: "GET",
    }),
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
    statusCodes: safeJsonParse<Record<string, number>>(row.status_codes_json, {}),
    timeline: safeJsonParse<SecondMetrics[]>(row.timeline_json, []),
    status: row.status as "completed" | "cancelled" | "error",
    errorMessage: row.error_message ?? undefined,
    protectionReport: safeJsonParse(row.protection_report_json, undefined),
    operationMetrics: safeJsonParse(row.operation_metrics_json, undefined),
    vuResults: safeJsonParse(row.vu_results_json, undefined),
    measurementReliability: safeJsonParse(
      row.measurement_reliability_json,
      undefined,
    ),
    operationalWarnings: safeJsonParse(
      row.operational_warnings_json,
      undefined,
    ),
    errorBreakdown: safeJsonParse(row.error_breakdown_json, undefined),
    externalBenchmarks: safeJsonParse(
      row.external_benchmarks_json,
      undefined,
    ),
  };
}

/** Salva um resultado de teste no banco. */
export function saveTestResult(result: TestResult): void {
  const db = getDatabase();

  const latency = result.latency as Record<string, number> | undefined;

  db.prepare(
    `
    INSERT OR REPLACE INTO test_results (
      id, url, config_json, start_time, end_time, duration_seconds,
      total_requests, total_errors, rps, latency_avg, latency_min,
      latency_p50, latency_p90, latency_p95, latency_p99, latency_max,
      error_rate, throughput_bytes_per_sec, total_bytes, status_codes_json,
      timeline_json, status, error_message, protection_report_json,
      operation_metrics_json, vu_results_json, measurement_reliability_json,
      operational_warnings_json, error_breakdown_json, external_benchmarks_json,
      created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `,
  ).run(
    result.id as string,
    result.url as string,
    JSON.stringify(result.config || {}),
    result.startTime as string,
    result.endTime as string,
    result.durationSeconds as number,
    result.totalRequests as number,
    result.totalErrors as number,
    result.rps as number,
    latency?.avg ?? null,
    latency?.min ?? null,
    latency?.p50 ?? null,
    latency?.p90 ?? null,
    latency?.p95 ?? null,
    latency?.p99 ?? null,
    latency?.max ?? null,
    result.errorRate as number,
    (result.throughputBytesPerSec as number) ?? null,
    (result.totalBytes as number) ?? null,
    JSON.stringify(result.statusCodes || {}),
    JSON.stringify(result.timeline || []),
    result.status as string,
    (result.errorMessage as string) || null,
    result.protectionReport ? JSON.stringify(result.protectionReport) : null,
    result.operationMetrics ? JSON.stringify(result.operationMetrics) : null,
    result.vuResults ? JSON.stringify(result.vuResults) : null,
    result.measurementReliability
      ? JSON.stringify(result.measurementReliability)
      : null,
    result.operationalWarnings
      ? JSON.stringify(result.operationalWarnings)
      : null,
    result.errorBreakdown ? JSON.stringify(result.errorBreakdown) : null,
    result.externalBenchmarks
      ? JSON.stringify(result.externalBenchmarks)
      : null,
    (result.startTime as string) || new Date().toISOString(),
  );
}

/** Persiste o snapshot dos benchmarks externos para um resultado já salvo. */
export function saveTestResultExternalBenchmarks(
  id: string,
  externalBenchmarks: PersistedExternalBenchmarks,
): boolean {
  const db = getDatabase();
  const result = db
    .prepare(
      `UPDATE test_results
       SET external_benchmarks_json = ?
       WHERE id = ?`,
    )
    .run(JSON.stringify(externalBenchmarks), id);

  return result.changes > 0;
}

/** Lista todos os resultados de testes ordenados por data (mais recente primeiro). */
export function listTestResults(limit = 100): TestResult[] {
  const db = getDatabase();
  const rows = db
    .prepare("SELECT * FROM test_results ORDER BY created_at DESC LIMIT ?")
    .all(limit) as TestResultRow[];

  return rows.flatMap((row) => {
    try {
      return [rowToTestResult(row)];
    } catch (error) {
      console.warn(
        `[CPX-Stress] Ignorando registro de histórico corrompido: ${row.id}`,
        error,
      );
      return [];
    }
  });
}

/** Busca um resultado de teste por ID. */
export function getTestResult(id: string): TestResult | null {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM test_results WHERE id = ?").get(id) as
    | TestResultRow
    | undefined;

  if (!row) return null;

  try {
    return rowToTestResult(row);
  } catch (error) {
    console.warn(
      `[CPX-Stress] Registro de histórico corrompido ao buscar teste ${id}`,
      error,
    );
    return null;
  }
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
  operationName?: string;
  timestampStart?: number;
  timestampEnd?: number;
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
  if (params.operationName) {
    conditions.push("operation_name = ?");
    values.push(params.operationName);
  }
  if (params.timestampStart !== undefined && params.timestampStart !== null) {
    conditions.push("timestamp >= ?");
    values.push(params.timestampStart);
  }
  if (params.timestampEnd !== undefined && params.timestampEnd !== null) {
    conditions.push("timestamp <= ?");
    values.push(params.timestampEnd);
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

/** Retorna contagem de erros agrupados por nome de operação para um teste. */
export function getErrorsByOperationName(testId: string): Record<string, number> {
  const db = getDatabase();
  const rows = db
    .prepare(
      "SELECT operation_name, COUNT(*) as count FROM test_errors WHERE test_id = ? GROUP BY operation_name ORDER BY count DESC",
    )
    .all(testId) as Array<{ operation_name: string; count: number }>;

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.operation_name] = row.count;
  }
  return result;
}

// ============================================================================
// Preset CRUD
// ============================================================================

/** Limite máximo de tamanho do config_json em bytes (1 MB). */
const MAX_CONFIG_JSON_SIZE = 1_048_576;

/** Converte uma row do SQLite para o formato TestPreset do renderer. */
function rowToPreset(row: PresetRow) {
  return {
    id: row.id,
    name: row.name,
    config: safeJsonParse(row.config_json, {}),
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
 * Se id não e fornecido ou não existe: insere novo.
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

  // Verificar duplicata de nome (mensagem amigavel em vez de UNIQUE constraint)
  const nameConflict = db
    .prepare("SELECT id FROM test_presets WHERE LOWER(name) = LOWER(?) AND id != ?")
    .get(data.name.trim(), data.id || "") as { id: string } | undefined;
  if (nameConflict) {
    throw new Error("Já existe um preset com este nome.");
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

/** Renomeia um preset do usuário. Rejeita built-in. */
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

/** Deleta um preset do usuário. Rejeita built-in. */
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
