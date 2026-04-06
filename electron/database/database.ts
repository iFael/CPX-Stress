/**
 * Database — Persistência SQLite para o StressFlow.
 *
 * Utiliza better-sqlite3 para armazenamento estruturado de:
 *   - Resultados de testes (metadados + métricas)
 *   - Timeline por segundo
 *   - Erros individuais detalhados
 *   - Métricas por operação (testes multi-operação)
 *
 * O banco e criado automaticamente na pasta de dados do usuário.
 * Migrations são aplicadas na inicialização (versionadas).
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let db: Database.Database | null = null;

/**
 * Inicializa o banco de dados SQLite.
 * Cria as tabelas se não existirem e aplica migrations.
 */
export function initDatabase(dataPath: string): Database.Database {
  if (db) return db;

  const dbPath = path.join(dataPath, "stressflow.db");

  db = new Database(dbPath);

  // Otimizacoes de performance para escrita em batch
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -64000"); // 64MB cache
  db.pragma("foreign_keys = ON");

  applyMigrations(db);

  return db;
}

/** Retorna a instância do banco ja inicializada. */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error(
      "[StressFlow DB] Banco de dados não foi inicializado. Chame initDatabase() primeiro.",
    );
  }
  return db;
}

/** Fecha a conexão com o banco de dados. */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ============================================================================
// Built-in Preset: MisterT Completo
// ============================================================================
// CRITICO: Este JSON e definido inline no codigo do electron/.
// NUNCA importar de src/constants/test-presets.ts — quebraria no build empacotado.
// O conteudo e uma copia serializada das 10 operacoes padrao do MisterT ERP.
// ============================================================================

/** Versao atual do preset built-in. Incrementar quando o template mudar. */
const CURRENT_BUILTIN_VERSION = 1;

/** ID fixo do preset built-in (nao muda entre versoes). */
const BUILTIN_PRESET_ID = "builtin-mistert-completo";

/** Configuracao completa do preset built-in serializada como JSON. */
const BUILTIN_CONFIG_JSON = JSON.stringify({
  url: "https://dev-mistert.compex.com.br/MisterT.asp?MF=Y",
  virtualUsers: 150,
  duration: 60,
  method: "GET",
  operations: [
    {
      name: "Página de Login",
      url: "https://dev-mistert.compex.com.br/MisterT.asp?MF=Y",
      method: "GET",
      captureSession: true,
      extract: { CTRL: "CTRL=(\\d+)" },
    },
    {
      name: "Login",
      url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=1",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "IN1={{STRESSFLOW_USER}}&IN2={{STRESSFLOW_PASS}}",
      captureSession: true,
      extract: { CTRL: "CTRL=(\\d+)" },
    },
    {
      name: "Menu Principal",
      url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=0",
      method: "GET",
      captureSession: true,
      extract: { CTRL: "CTRL=(\\d+)" },
    },
    {
      name: "CPX-Fretes",
      url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=89",
      method: "GET",
      captureSession: true,
      extract: { CTRL: "CTRL=(\\d+)" },
    },
    {
      name: "CPX-Rastreio",
      url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=90",
      method: "GET",
      captureSession: true,
      extract: { CTRL: "CTRL=(\\d+)" },
    },
    {
      name: "Estoque",
      url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=122",
      method: "GET",
      captureSession: true,
      extract: { CTRL: "CTRL=(\\d+)" },
    },
    {
      name: "Ordens E/S",
      url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=102",
      method: "GET",
      captureSession: true,
      extract: { CTRL: "CTRL=(\\d+)" },
    },
    {
      name: "Produção",
      url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=84",
      method: "GET",
      captureSession: true,
      extract: { CTRL: "CTRL=(\\d+)" },
    },
    {
      name: "Faturamento",
      url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=206",
      method: "GET",
      captureSession: true,
      extract: { CTRL: "CTRL=(\\d+)" },
    },
    {
      name: "Financeiro",
      url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=250",
      method: "GET",
      captureSession: true,
      extract: { CTRL: "CTRL=(\\d+)" },
    },
  ],
});

/**
 * Aplica migrations incrementais no banco.
 * Cada migration e executada dentro de uma transacao.
 */
function applyMigrations(database: Database.Database): void {
  // Tabela de controle de versão
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    )
  `);

  const currentVersion = database
    .prepare("SELECT MAX(version) as v FROM schema_version")
    .get() as { v: number | null };

  const version = currentVersion?.v ?? 0;

  if (version < 1) {
    database.transaction(() => {
      // Tabela principal de resultados de testes
      database.exec(`
        CREATE TABLE IF NOT EXISTS test_results (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          config_json TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          duration_seconds REAL NOT NULL,
          total_requests INTEGER NOT NULL,
          total_errors INTEGER NOT NULL,
          rps REAL NOT NULL,
          latency_avg REAL,
          latency_min REAL,
          latency_p50 REAL,
          latency_p90 REAL,
          latency_p95 REAL,
          latency_p99 REAL,
          latency_max REAL,
          error_rate REAL NOT NULL,
          throughput_bytes_per_sec REAL,
          total_bytes INTEGER,
          status_codes_json TEXT,
          timeline_json TEXT,
          status TEXT NOT NULL,
          error_message TEXT,
          protection_report_json TEXT,
          operation_metrics_json TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // Índice para busca por data
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_test_results_created_at
        ON test_results(created_at DESC)
      `);

      // Índice para busca por URL
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_test_results_url
        ON test_results(url)
      `);

      // Tabela de erros individuais
      database.exec(`
        CREATE TABLE IF NOT EXISTS test_errors (
          id TEXT PRIMARY KEY,
          test_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          operation_name TEXT NOT NULL DEFAULT 'default',
          status_code INTEGER NOT NULL DEFAULT 0,
          error_type TEXT NOT NULL DEFAULT 'unknown',
          message TEXT NOT NULL,
          response_snippet TEXT,
          FOREIGN KEY (test_id) REFERENCES test_results(id) ON DELETE CASCADE
        )
      `);

      // Índices para pesquisa de erros
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_test_errors_test_id
        ON test_errors(test_id)
      `);
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_test_errors_status_code
        ON test_errors(test_id, status_code)
      `);
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_test_errors_error_type
        ON test_errors(test_id, error_type)
      `);
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_test_errors_timestamp
        ON test_errors(test_id, timestamp)
      `);

      database
        .prepare("INSERT INTO schema_version (version) VALUES (?)")
        .run(1);
    })();
  }

  if (version < 2) {
    database.transaction(() => {
      database.exec(`
        ALTER TABLE test_results ADD COLUMN error_breakdown_json TEXT
      `);
      database
        .prepare("INSERT INTO schema_version (version) VALUES (?)")
        .run(2);
    })();
  }

  if (version < 3) {
    database.transaction(() => {
      // Tabela de presets de teste (built-in + criados pelo usuario)
      database.exec(`
        CREATE TABLE IF NOT EXISTS test_presets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          config_json TEXT NOT NULL,
          is_builtin INTEGER DEFAULT 0,
          builtin_version INTEGER,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // Seed do preset built-in "MisterT Completo" via prepared statement
      database
        .prepare(
          `INSERT INTO test_presets (id, name, config_json, is_builtin, builtin_version)
           VALUES (?, ?, ?, 1, ?)`
        )
        .run(BUILTIN_PRESET_ID, "MisterT Completo", BUILTIN_CONFIG_JSON, CURRENT_BUILTIN_VERSION);

      database
        .prepare("INSERT INTO schema_version (version) VALUES (?)")
        .run(3);
    })();
  }
}

/**
 * Verifica se o preset built-in esta na versao mais recente.
 * Se a versao no banco for inferior a CURRENT_BUILTIN_VERSION,
 * atualiza o config_json e a builtin_version automaticamente.
 * Chamado a cada inicializacao da aplicacao (apos migrations).
 */
export function ensureBuiltinPresetVersion(): void {
  const database = getDatabase();
  const row = database
    .prepare("SELECT builtin_version FROM test_presets WHERE id = ?")
    .get(BUILTIN_PRESET_ID) as { builtin_version: number } | undefined;

  if (!row || row.builtin_version < CURRENT_BUILTIN_VERSION) {
    database
      .prepare(
        `UPDATE test_presets
         SET config_json = ?, builtin_version = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(BUILTIN_CONFIG_JSON, CURRENT_BUILTIN_VERSION, BUILTIN_PRESET_ID);

    console.log(
      `[StressFlow DB] Preset built-in atualizado para versao ${CURRENT_BUILTIN_VERSION}.`
    );
  }
}

/**
 * Migra dados do history.json legado para o SQLite.
 * Executado uma unica vez na primeira inicialização após a migração.
 */
export function migrateFromJsonHistory(dataPath: string): void {
  const jsonPath = path.join(dataPath, "history.json");
  if (!fs.existsSync(jsonPath)) return;

  const database = getDatabase();
  const existingCount = database
    .prepare("SELECT COUNT(*) as c FROM test_results")
    .get() as { c: number };

  // Se ja tem dados no SQLite, não migrar (pode ser re-execução)
  if (existingCount.c > 0) return;

  try {
    const data = fs.readFileSync(jsonPath, "utf-8");
    const history = JSON.parse(data);
    if (!Array.isArray(history)) return;

    console.log(
      `[StressFlow DB] Migrando ${history.length} testes do history.json para SQLite...`,
    );

    const insertStmt = database.prepare(`
      INSERT OR IGNORE INTO test_results (
        id, url, config_json, start_time, end_time, duration_seconds,
        total_requests, total_errors, rps, latency_avg, latency_min,
        latency_p50, latency_p90, latency_p95, latency_p99, latency_max,
        error_rate, throughput_bytes_per_sec, total_bytes, status_codes_json,
        timeline_json, status, error_message, protection_report_json,
        operation_metrics_json, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    database.transaction(() => {
      for (const r of history) {
        if (!r.id) continue;
        insertStmt.run(
          r.id,
          r.url || "",
          JSON.stringify(r.config || {}),
          r.startTime || "",
          r.endTime || "",
          r.durationSeconds || 0,
          r.totalRequests || 0,
          r.totalErrors || 0,
          r.rps || 0,
          r.latency?.avg ?? null,
          r.latency?.min ?? null,
          r.latency?.p50 ?? null,
          r.latency?.p90 ?? null,
          r.latency?.p95 ?? null,
          r.latency?.p99 ?? null,
          r.latency?.max ?? null,
          r.errorRate || 0,
          r.throughputBytesPerSec ?? null,
          r.totalBytes ?? null,
          JSON.stringify(r.statusCodes || {}),
          JSON.stringify(r.timeline || []),
          r.status || "completed",
          r.errorMessage || null,
          r.protectionReport ? JSON.stringify(r.protectionReport) : null,
          r.operationMetrics ? JSON.stringify(r.operationMetrics) : null,
          r.startTime || new Date().toISOString(),
        );
      }
    })();

    // Renomear arquivo legado para backup
    const backupPath = path.join(dataPath, "history.json.migrated");
    fs.renameSync(jsonPath, backupPath);
    console.log(
      `[StressFlow DB] Migração concluida. Arquivo legado renomeado para history.json.migrated`,
    );
  } catch (error) {
    console.error("[StressFlow DB] Erro ao migrar history.json:", error);
  }
}
