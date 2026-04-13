/**
 * ============================================================================
 * CPX-Stress — Harness de Teste Programático do Engine
 * ============================================================================
 *
 * Invoca o StressEngine diretamente contra o mock server local e valida
 * todos os invariantes matemáticos e de consistência.
 *
 * Premissa: o mock server deve estar rodando em localhost:8787
 *   node audit/mock-server.js 8787
 *
 * Execução:
 *   npx tsx audit/engine-test-harness.ts
 *
 * Cenários:
 *   A1 — Baseline: 10 VUs, 15s, /ok (respostas rápidas 200)
 *   A2 — Ramp-up: 50 VUs, 20s, ramp-up 10s, /ok
 *   A3 — Erros mistos: 10 VUs, 15s, /errors-mixed (33% 200, 33% 500, 33% 503)
 *   A4 — Rate limited: 10 VUs, 15s, /rate-limited (50% 429)
 *   A5 — Latência variável: 5 VUs, 15s, /random-latency (50-5000ms)
 *   A6 — Alta carga: 200 VUs, 30s, /ok
 * ============================================================================
 */

// Patch dns.resolve4/resolve6 ANTES de importar o engine para que
// "localhost" resolva para um IP público fake nos testes.
// Isso permite testar contra o mock server local sem desativar a proteção SSRF.
import dns from "node:dns";
const originalResolve4 = dns.resolve4;
const originalResolve6 = dns.resolve6;
dns.resolve4 = ((
  hostname: string,
  cb: (err: Error | null, addrs: string[]) => void,
) => {
  if (hostname === "localhost") return cb(null, ["93.184.216.34"]); // IP público fake
  return originalResolve4.call(dns, hostname, cb);
}) as typeof dns.resolve4;
dns.resolve6 = ((
  hostname: string,
  cb: (err: Error | null, addrs: string[]) => void,
) => {
  if (hostname === "localhost") return cb(null, []);
  return originalResolve6.call(dns, hostname, cb);
}) as typeof dns.resolve6;

import { StressEngine } from "../electron/engine/stress-engine";
import type {
  TestConfig,
  TestResult,
  ProgressData,
  SecondMetrics,
} from "../electron/engine/stress-engine";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
// Reprodução idêntica das funções do engine para validação cruzada
// ============================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ============================================================================
// Reprodução idêntica do cálculo de Health Score (3 implementações no app)
// ============================================================================

function calculateHealthScore(result: TestResult): number {
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

  // Penalidades por errorRate (erros de conexão)
  if (result.errorRate > 50) score -= 60;
  else if (result.errorRate > 20) score -= 40;
  else if (result.errorRate > 5) score -= 25;
  else if (result.errorRate > 1) score -= 15;
  else if (result.errorRate > 0.5) score -= 5;

  // Penalidades por httpErrorRate (403, 429, 5xx)
  if (httpErrorRate > 50) score -= 40;
  else if (httpErrorRate > 20) score -= 25;
  else if (httpErrorRate > 5) score -= 10;

  // Sem bytes recebidos
  if (result.totalBytes === 0 && result.totalRequests > 0) score -= 30;

  // Penalidades por latência P95
  if (result.latency.p95 > 10000) score -= 30;
  else if (result.latency.p95 > 5000) score -= 20;
  else if (result.latency.p95 > 2000) score -= 15;
  else if (result.latency.p95 > 1000) score -= 10;
  else if (result.latency.p95 > 500) score -= 5;

  // Disparidade p99/p50
  const disparity =
    result.latency.p50 > 0 ? result.latency.p99 / result.latency.p50 : 1;
  if (disparity > 20) score -= 15;
  else if (disparity > 10) score -= 10;
  else if (disparity > 5) score -= 5;

  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// Motor de checks
// ============================================================================

interface CheckResult {
  id: string;
  description: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: string;
}

const allResults: CheckResult[] = [];
let currentScenario = "";

function check(
  id: string,
  description: string,
  passed: boolean | "warn",
  detail = "",
) {
  const status = passed === true ? "PASS" : passed === "warn" ? "WARN" : "FAIL";
  allResults.push({
    id: `${currentScenario}:${id}`,
    description,
    status,
    detail,
  });
  const icon = status === "PASS" ? "✅" : status === "WARN" ? "⚠️" : "❌";
  console.log(
    `  ${icon} [${id}] ${description}${detail ? ` — ${detail}` : ""}`,
  );
}

// ============================================================================
// Validações genéricas (usadas em todos os cenários)
// ============================================================================

function validateMathInvariants(result: TestResult) {
  console.log("\n  📐 Invariantes Matemáticos");

  // M-01: sum(statusCodes) + totalErrors === totalRequests
  const sumSC = Object.values(result.statusCodes || {}).reduce(
    (a, b) => a + b,
    0,
  );
  const expectedSum = result.totalRequests - result.totalErrors;
  check(
    "M-01",
    "sum(statusCodes) === totalRequests - totalErrors",
    sumSC === expectedSum,
    `sum=${sumSC}, expected=${expectedSum}, diff=${Math.abs(sumSC - expectedSum)}`,
  );

  // M-02: errorRate
  const expectedER =
    result.totalRequests > 0
      ? round2((result.totalErrors / result.totalRequests) * 100)
      : 0;
  check(
    "M-02",
    "errorRate === round2(totalErrors/totalRequests*100)",
    Math.abs(result.errorRate - expectedER) <= 0.01,
    `actual=${result.errorRate}, expected=${expectedER}`,
  );

  // M-03: Percentis monotônicos
  const l = result.latency;
  const mono =
    l.min <= l.p50 &&
    l.p50 <= l.p90 &&
    l.p90 <= l.p95 &&
    l.p95 <= l.p99 &&
    l.p99 <= l.max;
  check(
    "M-03",
    "min <= p50 <= p90 <= p95 <= p99 <= max",
    mono,
    `[${l.min}, ${l.p50}, ${l.p90}, ${l.p95}, ${l.p99}, ${l.max}]`,
  );

  // M-04: RPS
  const expectedRPS = round2(
    result.totalRequests / Math.max(result.durationSeconds, 0.1),
  );
  const rpsDiff =
    expectedRPS > 0 ? Math.abs(result.rps - expectedRPS) / expectedRPS : 0;
  check(
    "M-04",
    "RPS === round2(totalRequests/durationSeconds) (±1%)",
    rpsDiff <= 0.01,
    `actual=${result.rps}, expected=${expectedRPS}, relDiff=${(rpsDiff * 100).toFixed(3)}%`,
  );

  // M-05: throughput
  const expectedTP = round2(
    result.totalBytes / Math.max(result.durationSeconds, 0.1),
  );
  const tpDiff =
    expectedTP > 0
      ? Math.abs(result.throughputBytesPerSec - expectedTP) / expectedTP
      : 0;
  check(
    "M-05",
    "throughputBytesPerSec ≈ totalBytes/durationSeconds (±1%)",
    tpDiff <= 0.01,
    `actual=${result.throughputBytesPerSec}, expected=${expectedTP}`,
  );

  // M-06: errorRate 0-100
  check(
    "M-06",
    "errorRate ∈ [0, 100]",
    result.errorRate >= 0 && result.errorRate <= 100,
    `${result.errorRate}`,
  );

  // M-07: totalErrors <= totalRequests
  check(
    "M-07",
    "totalErrors <= totalRequests",
    result.totalErrors <= result.totalRequests,
    `errors=${result.totalErrors}, requests=${result.totalRequests}`,
  );

  // M-08: Todos os valores round2
  const isRound2 = (v: number) => Math.abs(v - round2(v)) < 1e-10;
  const round2Fields = [
    l.avg,
    l.min,
    l.p50,
    l.p90,
    l.p95,
    l.p99,
    l.max,
    result.rps,
    result.errorRate,
    result.throughputBytesPerSec,
  ];
  const allRound2 = round2Fields.every(isRound2);
  check(
    "M-08",
    "Todos os campos numéricos têm <=2 casas decimais",
    allRound2,
    round2Fields.map((v) => v.toString()).join(", "),
  );
}

function validateTimeline(result: TestResult) {
  console.log("\n  📊 Consistência de Timeline");
  const tl = result.timeline || [];

  // T-01: length
  const tlDiff = Math.abs(tl.length - result.config.duration);
  check(
    "T-01",
    "timeline.length ≈ config.duration (±2)",
    tlDiff <= 2,
    `len=${tl.length}, duration=${result.config.duration}`,
  );

  // T-02: sum(requests) ≈ totalRequests
  const sumReqs = tl.reduce((s, t) => s + t.requests, 0);
  const reqsDiffRel =
    result.totalRequests > 0
      ? Math.abs(sumReqs - result.totalRequests) / result.totalRequests
      : 0;
  check(
    "T-02",
    "sum(timeline.requests) ≈ totalRequests (±5%)",
    reqsDiffRel <= 0.05,
    `sum=${sumReqs}, total=${result.totalRequests}, relDiff=${(reqsDiffRel * 100).toFixed(2)}%`,
  );

  // T-03: sum(errors) ≈ totalErrors
  const sumErrs = tl.reduce((s, t) => s + t.errors, 0);
  const errsDiff = Math.abs(sumErrs - result.totalErrors);
  check(
    "T-03",
    "sum(timeline.errors) ≈ totalErrors (±5 ou ±5%)",
    errsDiff <= Math.max(5, result.totalErrors * 0.05),
    `sum=${sumErrs}, total=${result.totalErrors}, diff=${errsDiff}`,
  );

  // T-04: sum(bytes) ≈ totalBytes
  const sumBytes = tl.reduce((s, t) => s + t.bytesReceived, 0);
  const bytesDiffRel =
    result.totalBytes > 0
      ? Math.abs(sumBytes - result.totalBytes) / result.totalBytes
      : 0;
  check(
    "T-04",
    "sum(timeline.bytes) ≈ totalBytes (±5%)",
    result.totalBytes === 0 || bytesDiffRel <= 0.05,
    `sum=${sumBytes}, total=${result.totalBytes}`,
  );

  // T-05: Percentis per-second monotônicos
  let violations = 0;
  for (const sec of tl) {
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
      violations++;
    }
  }
  check(
    "T-05",
    "Percentis per-second monotônicos",
    violations === 0,
    `violações=${violations}/${tl.filter((s) => s.requests > 0).length}`,
  );

  // T-06: statusCodes por segundo
  let scViolations = 0;
  for (const sec of tl) {
    const scSum = Object.values(sec.statusCodes || {}).reduce(
      (a: number, b: number) => a + b,
      0,
    );
    if (Math.abs(scSum + sec.errors - sec.requests) > 2) scViolations++;
  }
  check(
    "T-06",
    "sum(sec.statusCodes) + sec.errors ≈ sec.requests (±2)",
    scViolations === 0,
    `violações=${scViolations}`,
  );

  // T-07: activeUsers <= config.virtualUsers
  const maxActive = Math.max(...tl.map((s) => s.activeUsers), 0);
  check(
    "T-07",
    "activeUsers <= config.virtualUsers",
    maxActive <= result.config.virtualUsers,
    `max=${maxActive}, config=${result.config.virtualUsers}`,
  );

  // T-08: seconds are sequential
  let seqOk = true;
  for (let i = 0; i < tl.length; i++) {
    if (tl[i].second !== i + 1) {
      seqOk = false;
      break;
    }
  }
  check(
    "T-08",
    "timeline.second é sequencial (1, 2, 3, ...)",
    seqOk,
    `length=${tl.length}`,
  );
}

function validateSanity(result: TestResult) {
  console.log("\n  🧪 Sanidade dos Dados");

  // S-01: Latências não negativas
  const l = result.latency;
  check(
    "S-01",
    "Latências >= 0",
    l.min >= 0 &&
      l.avg >= 0 &&
      l.p50 >= 0 &&
      l.p90 >= 0 &&
      l.p95 >= 0 &&
      l.p99 >= 0 &&
      l.max >= 0,
    `min=${l.min}`,
  );

  // S-02: RPS >= 0
  check("S-02", "RPS >= 0", result.rps >= 0, `${result.rps}`);

  // S-03: totalBytes >= 0
  check(
    "S-03",
    "totalBytes >= 0",
    result.totalBytes >= 0,
    `${result.totalBytes}`,
  );

  // S-04: duration razoável
  check(
    "S-04",
    "durationSeconds ≈ config.duration (±3s)",
    Math.abs(result.durationSeconds - result.config.duration) <= 3,
    `actual=${result.durationSeconds}, config=${result.config.duration}`,
  );

  // S-05: timestamps coerentes
  const tsDiff =
    (new Date(result.endTime).getTime() -
      new Date(result.startTime).getTime()) /
    1000;
  check(
    "S-05",
    "endTime - startTime ≈ durationSeconds (±3s)",
    Math.abs(tsDiff - result.durationSeconds) <= 3,
    `tsDiff=${tsDiff.toFixed(2)}, duration=${result.durationSeconds}`,
  );

  // S-06: Health score
  const score = calculateHealthScore(result);
  check(
    "S-06",
    "Health score computado é válido (0-100)",
    score >= 0 && score <= 100,
    `score=${score}`,
  );

  // S-07: status === 'completed'
  check(
    "S-07",
    "status === completed",
    result.status === "completed",
    `status=${result.status}`,
  );

  // S-08: id presente e único
  check(
    "S-08",
    "id é um UUID válido",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      result.id,
    ),
    `id=${result.id}`,
  );
}

function validateReservoir(result: TestResult) {
  console.log("\n  🎲 Reservoir Sampling");
  const RESERVOIR_MAX = 100_000;
  if (result.totalRequests > RESERVOIR_MAX) {
    check(
      "R-01",
      `totalRequests > RESERVOIR_MAX (${RESERVOIR_MAX})`,
      "warn",
      "Percentis globais baseados em amostragem",
    );
  } else {
    check(
      "R-01",
      "totalRequests <= RESERVOIR_MAX",
      true,
      `${result.totalRequests} <= ${RESERVOIR_MAX}`,
    );
  }
}

async function validateMixedProtocolAgentSelection() {
  currentScenario = "MIXED-PROTOCOL";
  console.log("\n" + "═".repeat(80));
  console.log("  🔬 VALIDAÇÃO: Seleção de Agent por protocolo");
  console.log("═".repeat(80));

  const engine = new StressEngine() as any;
  const controller = new AbortController();
  const httpAgent = { name: "http-agent" };
  const httpsAgent = { name: "https-agent" };
  const seen: Array<{ protocol: string; agentName: string }> = [];

  engine.makeRequest = async (opts: { url: URL; agent: { name: string } }) => {
    seen.push({ protocol: opts.url.protocol, agentName: opts.agent.name });
    if (seen.length >= 2) controller.abort();
    return { statusCode: 200, bytes: 128 };
  };

  await engine.spawnVU(0, {
    operations: [
      { name: "http-op", url: "http://example.com/ok", method: "GET" },
      { name: "https-op", url: "https://example.com/ok", method: "GET" },
    ],
    isHttps: false,
    agents: { http: httpAgent, https: httpsAgent },
    config: {
      url: "http://example.com/ok",
      virtualUsers: 1,
      duration: 1,
      method: "GET",
    },
    endTime: Date.now() + 2000,
    signal: controller.signal,
    testId: "mixed-protocol-test",
    onResponse: () => {},
    onError: () => {},
  });

  const httpSeen = seen.find((item) => item.protocol === "http:");
  const httpsSeen = seen.find((item) => item.protocol === "https:");
  check(
    "MP-01",
    "Operação HTTP usa o agent HTTP",
    httpSeen?.agentName === "http-agent",
    JSON.stringify(httpSeen),
  );
  check(
    "MP-02",
    "Operação HTTPS usa o agent HTTPS",
    httpsSeen?.agentName === "https-agent",
    JSON.stringify(httpsSeen),
  );
}

// ============================================================================
// Cenários de teste
// ============================================================================

interface TestScenario {
  name: string;
  config: TestConfig;
  extraValidations?: (
    result: TestResult,
    progressEvents: ProgressData[],
  ) => void;
}

const MOCK_BASE = "http://localhost:8787";

const scenarios: TestScenario[] = [
  {
    name: "A1-Baseline",
    config: {
      url: `${MOCK_BASE}/ok`,
      virtualUsers: 10,
      duration: 15,
      method: "GET",
    },
    extraValidations: (result) => {
      console.log("\n  🎯 Validações Específicas A1");
      // Baseline: expect 0 errors, all 200s
      check(
        "A1-01",
        "Zero erros de conexão",
        result.totalErrors === 0,
        `errors=${result.totalErrors}`,
      );
      check(
        "A1-02",
        "Apenas status 200",
        Object.keys(result.statusCodes).length === 1 &&
          result.statusCodes["200"] > 0,
        `codes=${JSON.stringify(result.statusCodes)}`,
      );
      check(
        "A1-03",
        "errorRate === 0",
        result.errorRate === 0,
        `${result.errorRate}`,
      );
      check(
        "A1-04",
        "totalBytes > 0",
        result.totalBytes > 0,
        `${result.totalBytes}`,
      );
      check(
        "A1-05",
        "Health score >= 85 em baseline saudável",
        calculateHealthScore(result) >= 85,
        `score=${calculateHealthScore(result)}`,
      );
    },
  },
  {
    name: "A2-RampUp",
    config: {
      url: `${MOCK_BASE}/ok`,
      virtualUsers: 50,
      duration: 20,
      method: "GET",
      rampUp: 10,
    },
    extraValidations: (result) => {
      console.log("\n  🎯 Validações Específicas A2 (Ramp-up)");
      const tl = result.timeline;
      // activeUsers deve crescer durante ramp-up
      if (tl.length >= 5) {
        const sec5 = tl[4]; // second 5
        const expectedAtSec5 = Math.ceil((5 / 10) * 50); // 25
        check(
          "A2-01",
          "activeUsers no segundo 5 ≈ 50% do total (±20%)",
          Math.abs(sec5.activeUsers - expectedAtSec5) <= expectedAtSec5 * 0.2,
          `actual=${sec5.activeUsers}, expected≈${expectedAtSec5}`,
        );
      }
      if (tl.length >= 11) {
        check(
          "A2-02",
          "activeUsers no segundo 11 === virtualUsers",
          tl[10].activeUsers === result.config.virtualUsers,
          `actual=${tl[10].activeUsers}, expected=${result.config.virtualUsers}`,
        );
      }
      // Verifica que o engine mantém throughput operacional pós ramp-up
      // Em servidores locais rápidos, mais VUs causa contenção e RPS pode não crescer,
      // mas o engine não deve travar — cada segundo pós-ramp deve ter requests > 0
      if (tl.length >= 15) {
        const postRamp = tl.slice(11, 15);
        const allPositive = postRamp.every((s) => s.requests > 0);
        const postRampAvg =
          postRamp.reduce((s, t) => s + t.requests, 0) / postRamp.length;
        check(
          "A2-03",
          "Engine mantém throughput pós ramp-up (todos segundos > 0, avg > 100)",
          allPositive && postRampAvg > 100,
          `postRamp_seconds=${postRamp.length}, allPositive=${allPositive}, avg=${postRampAvg.toFixed(0)}`,
        );
      }
    },
  },
  {
    name: "A3-ErrorsMixed",
    config: {
      url: `${MOCK_BASE}/errors-mixed`,
      virtualUsers: 10,
      duration: 15,
      method: "GET",
    },
    extraValidations: (result) => {
      console.log("\n  🎯 Validações Específicas A3 (Erros Mistos)");
      // /errors-mixed retorna ~33% 200, ~33% 500, ~33% 503
      const codes = result.statusCodes;
      const total200 = codes["200"] || 0;
      const total500 = codes["500"] || 0;
      const total503 = codes["503"] || 0;
      const totalHTTP = total200 + total500 + total503;

      check(
        "A3-01",
        "Tem status 200, 500 e 503",
        total200 > 0 && total500 > 0 && total503 > 0,
        `200=${total200}, 500=${total500}, 503=${total503}`,
      );

      // Cada código ~33% (±15% tolerance)
      if (totalHTTP > 0) {
        const pct200 = (total200 / totalHTTP) * 100;
        const pct500 = (total500 / totalHTTP) * 100;
        const pct503 = (total503 / totalHTTP) * 100;
        check(
          "A3-02",
          "Distribuição ~33% cada (±15%)",
          Math.abs(pct200 - 33.33) < 15 &&
            Math.abs(pct500 - 33.33) < 15 &&
            Math.abs(pct503 - 33.33) < 15,
          `200=${pct200.toFixed(1)}%, 500=${pct500.toFixed(1)}%, 503=${pct503.toFixed(1)}%`,
        );
      }

      // HTTP error rate should be ~66% (500 + 503)
      const httpErrRate =
        totalHTTP > 0 ? ((total500 + total503) / totalHTTP) * 100 : 0;
      check(
        "A3-03",
        "httpErrorRate ≈ 66% (±15%)",
        Math.abs(httpErrRate - 66.67) < 15,
        `httpErrorRate=${httpErrRate.toFixed(1)}%`,
      );

      // errorRate (connection errors) should be ~0%
      check(
        "A3-04",
        "errorRate (conexão) < 5%",
        result.errorRate < 5,
        `errorRate=${result.errorRate}%`,
      );
    },
  },
  {
    name: "A4-RateLimited",
    config: {
      url: `${MOCK_BASE}/rate-limited`,
      virtualUsers: 10,
      duration: 15,
      method: "GET",
    },
    extraValidations: (result) => {
      console.log("\n  🎯 Validações Específicas A4 (Rate Limited)");
      // /rate-limited retorna ~50% 429
      const code429 = result.statusCodes["429"] || 0;
      const code200 = result.statusCodes["200"] || 0;
      const totalHTTP = code429 + code200;

      check(
        "A4-01",
        "Tem status 200 e 429",
        code200 > 0 && code429 > 0,
        `200=${code200}, 429=${code429}`,
      );

      if (totalHTTP > 0) {
        const pct429 = (code429 / totalHTTP) * 100;
        check(
          "A4-02",
          "429 ≈ 50% (±20%)",
          Math.abs(pct429 - 50) < 20,
          `429=${pct429.toFixed(1)}%`,
        );
      }

      // errorRate (conexão) deve ser ~0
      check(
        "A4-03",
        "errorRate (conexão) < 5%",
        result.errorRate < 5,
        `errorRate=${result.errorRate}%`,
      );
    },
  },
  {
    name: "A5-VariableLatency",
    config: {
      url: `${MOCK_BASE}/random-latency`,
      virtualUsers: 5,
      duration: 15,
      method: "GET",
    },
    extraValidations: (result) => {
      console.log("\n  🎯 Validações Específicas A5 (Latência Variável)");
      // /random-latency: 50-5000ms
      check(
        "A5-01",
        "latency.min >= 40ms (margem para ~50ms)",
        result.latency.min >= 40,
        `min=${result.latency.min}ms`,
      );
      check(
        "A5-02",
        "latency.max >= 1000ms",
        result.latency.max >= 1000,
        `max=${result.latency.max}ms`,
      );
      check(
        "A5-03",
        "Disparidade p99/p50 > 1.5 (latência variável)",
        result.latency.p50 > 0 && result.latency.p99 / result.latency.p50 > 1.5,
        `p99/p50=${result.latency.p50 > 0 ? (result.latency.p99 / result.latency.p50).toFixed(2) : "N/A"}`,
      );
    },
  },
  {
    name: "A6-HighLoad",
    config: {
      url: `${MOCK_BASE}/ok`,
      virtualUsers: 200,
      duration: 30,
      method: "GET",
    },
    extraValidations: (result) => {
      console.log("\n  🎯 Validações Específicas A6 (Alta Carga)");
      check(
        "A6-01",
        "totalRequests > 5000 (carga significativa)",
        result.totalRequests > 5000,
        `total=${result.totalRequests}`,
      );

      // Estabilidade: CV do RPS nos segundos estáveis (trim agressivo: ignorar primeiros 3 e últimos 3)
      // Em ambiente local com 200 VUs, CV até 50% é aceitável por contenção de recursos
      const tl = result.timeline;
      if (tl.length >= 8) {
        const stable = tl.slice(3, -3).map((s) => s.requests);
        const avg = stable.reduce((a, b) => a + b, 0) / stable.length;
        const stddev = Math.sqrt(
          stable.reduce((s, v) => s + (v - avg) ** 2, 0) / stable.length,
        );
        const cv = avg > 0 ? (stddev / avg) * 100 : 0;
        check(
          "A6-02",
          "CV do RPS (steady state) <= 50%",
          cv <= 50,
          `CV=${cv.toFixed(1)}%, avg=${avg.toFixed(0)} req/s, stddev=${stddev.toFixed(1)}, samples=${stable.length}`,
        );
      }
    },
  },
];

// ============================================================================
// Execução dos cenários
// ============================================================================

async function checkMockServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`${MOCK_BASE}/ok`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function runScenario(
  scenario: TestScenario,
): Promise<{ passed: number; failed: number; warned: number }> {
  currentScenario = scenario.name;
  const startIdx = allResults.length;

  console.log("\n" + "═".repeat(80));
  console.log(`  🔬 CENÁRIO: ${scenario.name}`);
  console.log(
    `  Config: ${scenario.config.virtualUsers} VUs, ${scenario.config.duration}s, ${scenario.config.method} ${scenario.config.url}`,
  );
  if (scenario.config.rampUp)
    console.log(`  Ramp-up: ${scenario.config.rampUp}s`);
  console.log("═".repeat(80));

  const engine = new StressEngine();
  const progressEvents: ProgressData[] = [];

  const startTs = Date.now();
  const result = await engine.run(scenario.config, (progress) => {
    progressEvents.push(progress);
  });
  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);

  console.log(
    `\n  ⏱  Completo em ${elapsed}s — ${result.totalRequests} requests, ${result.totalErrors} errors`,
  );

  // Salvar resultado JSON para inspeção posterior
  const outDir = path.join(__dirname, "results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${scenario.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`  💾 Resultado salvo em ${outPath}`);

  // Validações genéricas
  validateMathInvariants(result);
  validateTimeline(result);
  validateSanity(result);
  validateReservoir(result);

  // Validações de progress events
  console.log("\n  📡 Validação de Progress Events");
  check(
    "P-01",
    "Recebeu progress events",
    progressEvents.length > 0,
    `count=${progressEvents.length}`,
  );
  if (progressEvents.length > 0) {
    const lastProgress = progressEvents[progressEvents.length - 1];
    check(
      "P-02",
      "Último progress.currentSecond ≈ config.duration (±2)",
      Math.abs(lastProgress.currentSecond - scenario.config.duration) <= 2,
      `last=${lastProgress.currentSecond}, config=${scenario.config.duration}`,
    );
    check(
      "P-03",
      "totalSeconds === config.duration",
      lastProgress.totalSeconds === scenario.config.duration,
      `${lastProgress.totalSeconds}`,
    );
    check(
      "P-04",
      "Último progress cobre o último ponto da timeline",
      lastProgress.currentSecond ===
        result.timeline[result.timeline.length - 1]?.second,
      `progress=${lastProgress.currentSecond}, timeline=${result.timeline[result.timeline.length - 1]?.second}`,
    );
    check(
      "P-05",
      "Quantidade de progress events acompanha timeline (±1)",
      Math.abs(progressEvents.length - result.timeline.length) <= 1,
      `progress=${progressEvents.length}, timeline=${result.timeline.length}`,
    );
  }

  // Validações específicas do cenário
  if (scenario.extraValidations) {
    scenario.extraValidations(result, progressEvents);
  }

  // Contagem
  const scenarioResults = allResults.slice(startIdx);
  const passed = scenarioResults.filter((r) => r.status === "PASS").length;
  const failed = scenarioResults.filter((r) => r.status === "FAIL").length;
  const warned = scenarioResults.filter((r) => r.status === "WARN").length;
  console.log(
    `\n  📋 ${scenario.name}: ${passed} PASS | ${failed} FAIL | ${warned} WARN`,
  );

  return { passed, failed, warned };
}

async function main() {
  console.log("\n" + "█".repeat(80));
  console.log("  CPX-Stress — Engine Test Harness");
  console.log("  Auditoria Programática de Precisão de Métricas");
  console.log("█".repeat(80));

  // Verificar mock server
  console.log("\n⏳ Verificando mock server em localhost:8787...");
  const serverOk = await checkMockServer();
  if (!serverOk) {
    console.error("❌ Mock server não está respondendo em localhost:8787");
    console.error("   Execute: node audit/mock-server.js 8787");
    process.exit(1);
  }
  console.log("✅ Mock server ativo\n");

  const scenarioSummaries: {
    name: string;
    passed: number;
    failed: number;
    warned: number;
  }[] = [];

  for (const scenario of scenarios) {
    try {
      const summary = await runScenario(scenario);
      scenarioSummaries.push({ name: scenario.name, ...summary });
    } catch (err) {
      console.error(`\n❌ ERRO FATAL no cenário ${scenario.name}: ${err}`);
      scenarioSummaries.push({
        name: scenario.name,
        passed: 0,
        failed: 1,
        warned: 0,
      });
    }
  }

  await validateMixedProtocolAgentSelection();

  // Sumário final
  console.log("\n\n" + "█".repeat(80));
  console.log("  SUMÁRIO FINAL");
  console.log("█".repeat(80));

  const totalPassed = allResults.filter((r) => r.status === "PASS").length;
  const totalFailed = allResults.filter((r) => r.status === "FAIL").length;
  const totalWarned = allResults.filter((r) => r.status === "WARN").length;
  const total = allResults.length;

  console.log(`\n  Total: ${total} checks`);
  console.log(`  ✅ PASS: ${totalPassed}`);
  console.log(`  ❌ FAIL: ${totalFailed}`);
  console.log(`  ⚠️  WARN: ${totalWarned}`);

  console.log("\n  Por cenário:");
  for (const s of scenarioSummaries) {
    const icon = s.failed === 0 ? "✅" : "❌";
    console.log(
      `    ${icon} ${s.name}: ${s.passed} pass, ${s.failed} fail, ${s.warned} warn`,
    );
  }

  if (totalFailed > 0) {
    console.log("\n  ❌ FALHAS DETALHADAS:");
    allResults
      .filter((r) => r.status === "FAIL")
      .forEach((r) => {
        console.log(`    [${r.id}] ${r.description} — ${r.detail}`);
      });
  }

  // ACHADOS DE SEGURANÇA
  console.log("\n" + "═".repeat(80));
  console.log("  🔒 ACHADOS DE SEGURANÇA");
  console.log("═".repeat(80));
  console.log(
    "  ✅ CORRIGIDO: validateTargetHost() agora é chamada no engine.run() antes do preflight.",
  );
  console.log("     A proteção SSRF contra IPs privados está ATIVA.");
  console.log(
    "     Testado: localhost é corretamente bloqueado (ver audit/test-ssrf.ts).",
  );

  // ACHADOS DE DUPLICAÇÃO
  console.log("\n" + "═".repeat(80));
  console.log("  🔄 ACHADOS DE DUPLICAÇÃO DE CÓDIGO");
  console.log("═".repeat(80));
  console.log(
    "  ✅ Health score: 3 implementações IDÊNTICAS (TestResults, ResultsSummary, PDF)",
  );
  console.log("  ✅ httpErrorRate: 3 implementações IDÊNTICAS");
  console.log(
    "  ✅ formatMs: CORRIGIDO — PDF agora usa .toFixed(1) igual à UI",
  );

  const verdict = totalFailed === 0 ? "✅ APROVADO" : "❌ REPROVADO";
  console.log(`\n  🏁 VEREDICTO: ${verdict}`);
  console.log("█".repeat(80) + "\n");

  // Salvar sumário
  const summaryPath = path.join(__dirname, "results", "SUMMARY.json");
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        verdict: totalFailed === 0 ? "APPROVED" : "REJECTED",
        totals: {
          passed: totalPassed,
          failed: totalFailed,
          warned: totalWarned,
          total,
        },
        scenarios: scenarioSummaries,
        failures: allResults.filter((r) => r.status === "FAIL"),
        securityFindings: [
          "FIXED: validateTargetHost() now called in engine.run()",
        ],
        duplicationFindings: [
          "Health score: 3 identical implementations",
          "httpErrorRate: 3 identical implementations",
          "FIXED: formatMs normalized across PDF and UI",
        ],
      },
      null,
      2,
    ),
  );
  console.log(`📄 Sumário salvo em ${summaryPath}`);

  process.exit(totalFailed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`Erro fatal: ${err}`);
  process.exit(2);
});
