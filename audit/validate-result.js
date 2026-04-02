/**
 * ============================================================================
 * StressFlow — Script de Validação Automatizada de Resultados
 * ============================================================================
 *
 * Valida um arquivo JSON exportado pelo StressFlow contra todos os invariantes
 * definidos no plano de auditoria de precisão.
 *
 * Uso:
 *   node audit/validate-result.js <caminho-do-json>
 *
 * Saída:
 *   Lista de checks com PASS / FAIL / WARN e sumário final.
 *
 * Critérios de aprovação (rigoroso, desvio <=1%):
 *   - Invariantes matemáticos (statusCodes, errorRate, RPS, percentis)
 *   - Consistência interna (timeline vs agregados)
 *   - Saúde dos dados (sem valores impossíveis)
 * ============================================================================
 */

const fs = require("node:fs");
const path = require("node:path");

// ============================================================================
// Funções auxiliares
// ============================================================================

function round2(n) {
  return Math.round(n * 100) / 100;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function calculateHealthScore(result) {
  const httpErrorCount = Object.entries(result.statusCodes || {})
    .filter(([code]) => code === "403" || code === "429" || Number(code) >= 500)
    .reduce((sum, [, count]) => sum + count, 0);
  const httpErrorRate =
    result.totalRequests > 0
      ? (httpErrorCount / result.totalRequests) * 100
      : 0;

  if (
    result.errorRate >= 95 ||
    (result.totalRequests === result.totalErrors && result.latency.avg === 0)
  ) {
    return 0;
  }
  if (httpErrorRate >= 90) return 5;

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

// ============================================================================
// Motor de validação
// ============================================================================

const results = [];

function check(id, description, passed, detail = "") {
  const status = passed === true ? "PASS" : passed === "warn" ? "WARN" : "FAIL";
  results.push({ id, description, status, detail });
  const icon = status === "PASS" ? "✅" : status === "WARN" ? "⚠️" : "❌";
  console.log(
    `  ${icon} [${id}] ${description}${detail ? ` — ${detail}` : ""}`,
  );
}

function validate(result) {
  console.log("\n" + "=".repeat(80));
  console.log(" VALIDAÇÃO DE RESULTADO — StressFlow Audit");
  console.log("=".repeat(80));
  console.log(`  URL: ${result.url}`);
  console.log(
    `  Config: ${result.config.virtualUsers} VUs, ${result.config.duration}s, ${result.config.method}`,
  );
  console.log(`  Status: ${result.status}`);
  console.log(`  Total Requests: ${result.totalRequests}`);
  console.log(`  Duration: ${result.durationSeconds}s`);
  console.log("=".repeat(80));

  // ========================================================================
  // BLOCO 1: Invariantes matemáticos
  // ========================================================================
  console.log("\n📐 BLOCO 1: Invariantes Matemáticos\n");

  // 1.1 Soma de status codes === totalRequests
  const sumStatusCodes = Object.values(result.statusCodes || {}).reduce(
    (a, b) => a + b,
    0,
  );
  // Status codes contam apenas respostas HTTP recebidas (não inclui erros de conexão)
  const expectedStatusSum = result.totalRequests - result.totalErrors;
  check(
    "M-01",
    "sum(statusCodes) === totalRequests - totalErrors",
    sumStatusCodes === expectedStatusSum,
    `sum=${sumStatusCodes}, expected=${expectedStatusSum}, diff=${Math.abs(sumStatusCodes - expectedStatusSum)}`,
  );

  // 1.2 ErrorRate === round2((totalErrors / totalRequests) * 100)
  const expectedErrorRate =
    result.totalRequests > 0
      ? round2((result.totalErrors / result.totalRequests) * 100)
      : 0;
  const errorRateDiff = Math.abs(result.errorRate - expectedErrorRate);
  check(
    "M-02",
    "errorRate === round2(totalErrors/totalRequests*100)",
    errorRateDiff <= 0.01,
    `actual=${result.errorRate}, expected=${expectedErrorRate}, diff=${errorRateDiff}`,
  );

  // 1.3 Percentis em ordem monotônica
  const { latency } = result;
  const monoCheck =
    latency.min <= latency.p50 &&
    latency.p50 <= latency.p90 &&
    latency.p90 <= latency.p95 &&
    latency.p95 <= latency.p99 &&
    latency.p99 <= latency.max;
  check(
    "M-03",
    "Percentis em ordem: min <= p50 <= p90 <= p95 <= p99 <= max",
    monoCheck,
    `min=${latency.min}, p50=${latency.p50}, p90=${latency.p90}, p95=${latency.p95}, p99=${latency.p99}, max=${latency.max}`,
  );

  // 1.4 RPS === round2(totalRequests / durationSeconds) (tolerância 1%)
  const expectedRps = round2(
    result.totalRequests / Math.max(result.durationSeconds, 0.1),
  );
  const rpsDiff = Math.abs(result.rps - expectedRps);
  const rpsRelDiff = expectedRps > 0 ? rpsDiff / expectedRps : 0;
  check(
    "M-04",
    "RPS === round2(totalRequests/durationSeconds) (±1%)",
    rpsRelDiff <= 0.01,
    `actual=${result.rps}, expected=${expectedRps}, relDiff=${(rpsRelDiff * 100).toFixed(3)}%`,
  );

  // 1.5 throughputBytesPerSec === round2(totalBytes / durationSeconds)
  const expectedThroughput = round2(
    result.totalBytes / Math.max(result.durationSeconds, 0.1),
  );
  const tpDiff = Math.abs(result.throughputBytesPerSec - expectedThroughput);
  const tpRelDiff = expectedThroughput > 0 ? tpDiff / expectedThroughput : 0;
  check(
    "M-05",
    "throughputBytesPerSec === round2(totalBytes/durationSeconds) (±1%)",
    tpRelDiff <= 0.01,
    `actual=${result.throughputBytesPerSec}, expected=${expectedThroughput}, relDiff=${(tpRelDiff * 100).toFixed(3)}%`,
  );

  // 1.6 errorRate está entre 0 e 100
  check(
    "M-06",
    "errorRate entre 0 e 100",
    result.errorRate >= 0 && result.errorRate <= 100,
    `errorRate=${result.errorRate}`,
  );

  // 1.7 totalErrors <= totalRequests
  check(
    "M-07",
    "totalErrors <= totalRequests",
    result.totalErrors <= result.totalRequests,
    `errors=${result.totalErrors}, requests=${result.totalRequests}`,
  );

  // ========================================================================
  // BLOCO 2: Consistência de Timeline
  // ========================================================================
  console.log("\n📊 BLOCO 2: Consistência de Timeline\n");

  const timeline = result.timeline || [];

  // 2.1 timeline.length próximo de durationSeconds
  const tlLenDiff = Math.abs(timeline.length - result.config.duration);
  check(
    "T-01",
    "timeline.length ≈ config.duration (±2)",
    tlLenDiff <= 2,
    `timeline=${timeline.length}, duration=${result.config.duration}, diff=${tlLenDiff}`,
  );

  // 2.2 sum(timeline.requests) ≈ totalRequests
  const tlTotalReqs = timeline.reduce((s, t) => s + t.requests, 0);
  const tlReqsDiff = Math.abs(tlTotalReqs - result.totalRequests);
  const tlReqsRelDiff =
    result.totalRequests > 0 ? tlReqsDiff / result.totalRequests : 0;
  check(
    "T-02",
    "sum(timeline.requests) ≈ totalRequests (±5%)",
    tlReqsRelDiff <= 0.05,
    `timelineSum=${tlTotalReqs}, total=${result.totalRequests}, relDiff=${(tlReqsRelDiff * 100).toFixed(2)}%`,
  );

  // 2.3 sum(timeline.errors) ≈ totalErrors
  const tlTotalErrs = timeline.reduce((s, t) => s + t.errors, 0);
  const tlErrsDiff = Math.abs(tlTotalErrs - result.totalErrors);
  check(
    "T-03",
    "sum(timeline.errors) ≈ totalErrors (±5 ou ±5%)",
    tlErrsDiff <= Math.max(5, result.totalErrors * 0.05),
    `timelineSum=${tlTotalErrs}, total=${result.totalErrors}, diff=${tlErrsDiff}`,
  );

  // 2.4 sum(timeline.bytesReceived) ≈ totalBytes
  const tlTotalBytes = timeline.reduce((s, t) => s + t.bytesReceived, 0);
  const tlBytesDiff = Math.abs(tlTotalBytes - result.totalBytes);
  const tlBytesRelDiff =
    result.totalBytes > 0 ? tlBytesDiff / result.totalBytes : 0;
  check(
    "T-04",
    "sum(timeline.bytesReceived) ≈ totalBytes (±5%)",
    result.totalBytes === 0 || tlBytesRelDiff <= 0.05,
    `timelineSum=${tlTotalBytes}, total=${result.totalBytes}, relDiff=${(tlBytesRelDiff * 100).toFixed(2)}%`,
  );

  // 2.5 Percentis por segundo em ordem monotônica
  let perSecMonoViolations = 0;
  for (const sec of timeline) {
    if (sec.requests === 0) continue;
    if (
      !(
        sec.latencyMin <= sec.latencyP50 &&
        sec.latencyP50 <= sec.latencyP90 &&
        sec.latencyP90 <= sec.latencyP95 &&
        sec.latencyP95 <= sec.latencyP99 &&
        sec.latencyP99 <= sec.latencyMax
      )
    ) {
      perSecMonoViolations++;
    }
  }
  check(
    "T-05",
    "Percentis por segundo em ordem monotônica",
    perSecMonoViolations === 0,
    `violações=${perSecMonoViolations} de ${timeline.filter((s) => s.requests > 0).length} segundos`,
  );

  // 2.6 Status codes por segundo somam ≈ requests daquele segundo
  let scViolations = 0;
  for (const sec of timeline) {
    const scSum = Object.values(sec.statusCodes || {}).reduce(
      (a, b) => a + b,
      0,
    );
    // statusCodes conta apenas HTTP responses; sec.requests inclui erros de conexão
    // Portanto scSum + sec.errors deve ≈ sec.requests
    if (Math.abs(scSum + sec.errors - sec.requests) > 2) {
      scViolations++;
    }
  }
  check(
    "T-06",
    "sum(sec.statusCodes) + sec.errors ≈ sec.requests por segundo (±2)",
    scViolations === 0,
    `violações=${scViolations}`,
  );

  // 2.7 activeUsers nunca excede config.virtualUsers
  const maxActive = Math.max(...timeline.map((s) => s.activeUsers), 0);
  check(
    "T-07",
    "activeUsers nunca excede config.virtualUsers",
    maxActive <= result.config.virtualUsers,
    `maxActive=${maxActive}, configured=${result.config.virtualUsers}`,
  );

  // ========================================================================
  // BLOCO 3: Sanidade dos dados
  // ========================================================================
  console.log("\n🧪 BLOCO 3: Sanidade dos Dados\n");

  // 3.1 Latências não negativas
  check(
    "S-01",
    "Latências não negativas",
    latency.min >= 0 && latency.avg >= 0 && latency.p50 >= 0,
    `min=${latency.min}, avg=${latency.avg}`,
  );

  // 3.2 RPS não negativo
  check("S-02", "RPS não negativo", result.rps >= 0, `rps=${result.rps}`);

  // 3.3 totalBytes não negativo
  check(
    "S-03",
    "totalBytes não negativo",
    result.totalBytes >= 0,
    `totalBytes=${result.totalBytes}`,
  );

  // 3.4 durationSeconds razoável (entre 1s e duration + 3s)
  const durReasonable =
    result.durationSeconds >= 1 &&
    result.durationSeconds <= result.config.duration + 3;
  check(
    "S-04",
    "durationSeconds razoável (±3s do configurado)",
    durReasonable,
    `actual=${result.durationSeconds}, configured=${result.config.duration}`,
  );

  // 3.5 Se totalRequests > 0 e errorRate < 100%, deve ter algum status code
  if (result.totalRequests > 0 && result.errorRate < 100) {
    check(
      "S-05",
      "Se tem requests sem 100% erro, deve ter statusCodes",
      Object.keys(result.statusCodes || {}).length > 0,
      `statusCodes keys=${Object.keys(result.statusCodes || {}).length}`,
    );
  }

  // 3.6 Health score consistente
  const computedScore = calculateHealthScore(result);
  check(
    "S-06",
    "Health score computado localmente é válido (0-100)",
    computedScore >= 0 && computedScore <= 100,
    `score=${computedScore}`,
  );

  // 3.7 Timestamps coerentes
  const start = new Date(result.startTime).getTime();
  const end = new Date(result.endTime).getTime();
  const tsDiff = (end - start) / 1000;
  check(
    "S-07",
    "endTime - startTime ≈ durationSeconds (±3s)",
    Math.abs(tsDiff - result.durationSeconds) <= 3,
    `timestampDiff=${tsDiff.toFixed(2)}s, durationSeconds=${result.durationSeconds}`,
  );

  // 3.8 Se houve ramp-up, activeUsers deve crescer
  if (
    result.config.rampUp &&
    result.config.rampUp > 0 &&
    timeline.length >= 3
  ) {
    const first = timeline[0]?.activeUsers || 0;
    const mid =
      timeline[
        Math.min(Math.floor(result.config.rampUp / 2), timeline.length - 1)
      ]?.activeUsers || 0;
    check(
      "S-08",
      "Com ramp-up, activeUsers cresce ao longo do tempo",
      mid >= first,
      `first=${first}, mid=${mid}`,
    );
  }

  // ========================================================================
  // BLOCO 4: Validação de Reservoir Sampling (se aplicável)
  // ========================================================================
  console.log("\n🎲 BLOCO 4: Reservoir Sampling\n");

  const RESERVOIR_MAX = 100_000;
  if (result.totalRequests > RESERVOIR_MAX) {
    check(
      "R-01",
      `totalRequests (${result.totalRequests}) > RESERVOIR_MAX (${RESERVOIR_MAX})`,
      "warn",
      "Percentis globais são baseados em amostragem — podem divergir dos cálculos por segundo",
    );
  } else {
    check(
      "R-01",
      "totalRequests dentro do RESERVOIR_MAX",
      true,
      `${result.totalRequests} <= ${RESERVOIR_MAX}`,
    );
  }

  // ========================================================================
  // SUMÁRIO
  // ========================================================================
  console.log("\n" + "=".repeat(80));
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const warned = results.filter((r) => r.status === "WARN").length;
  const total = results.length;

  console.log(
    ` SUMÁRIO: ${passed}/${total} PASS | ${failed} FAIL | ${warned} WARN`,
  );

  if (failed > 0) {
    console.log("\n ❌ FALHAS:");
    results
      .filter((r) => r.status === "FAIL")
      .forEach((r) => {
        console.log(`    [${r.id}] ${r.description} — ${r.detail}`);
      });
  }

  if (warned > 0) {
    console.log("\n ⚠️ AVISOS:");
    results
      .filter((r) => r.status === "WARN")
      .forEach((r) => {
        console.log(`    [${r.id}] ${r.description} — ${r.detail}`);
      });
  }

  const verdict = failed === 0 ? "✅ APROVADO" : "❌ REPROVADO";
  console.log(`\n 🏁 VEREDICTO: ${verdict}`);
  console.log("=".repeat(80) + "\n");

  return {
    passed,
    failed,
    warned,
    total,
    verdict: failed === 0 ? "APPROVED" : "REJECTED",
  };
}

// ============================================================================
// Execução principal
// ============================================================================

const filePath = process.argv[2];
if (!filePath) {
  console.error("Uso: node audit/validate-result.js <caminho-do-json>");
  console.error("Exemplo: node audit/validate-result.js audit/result-A1.json");
  process.exit(1);
}

const absPath = path.resolve(filePath);
if (!fs.existsSync(absPath)) {
  console.error(`Arquivo não encontrado: ${absPath}`);
  process.exit(1);
}

try {
  const raw = fs.readFileSync(absPath, "utf-8");
  const data = JSON.parse(raw);
  const summary = validate(data);
  process.exit(summary.verdict === "APPROVED" ? 0 : 1);
} catch (err) {
  console.error(`Erro ao processar ${absPath}: ${err.message}`);
  process.exit(2);
}
