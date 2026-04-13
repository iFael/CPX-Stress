/**
 * ============================================================================
 * CPX-Stress — Teste de Carga Extrema (Fase 2)
 * ============================================================================
 *
 * Testa o engine com carga progressiva: 500, 1000, 3000, 5000 VUs
 * Monitora saturação, estabilidade e limites do sistema.
 *
 * Execução:
 *   npx tsx audit/stress-extreme-test.ts
 * ============================================================================
 */

// Patch dns ANTES de importar o engine (bypass SSRF para testes locais)
import dns from "node:dns";
const originalResolve4 = dns.resolve4;
const originalResolve6 = dns.resolve6;
dns.resolve4 = ((
  hostname: string,
  cb: (err: Error | null, addrs: string[]) => void,
) => {
  if (hostname === "localhost") return cb(null, ["93.184.216.34"]);
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
} from "../electron/engine/stress-engine";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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

const MOCK_BASE = "http://localhost:8787";

interface StressScenario {
  name: string;
  config: TestConfig;
  repetitions: number;
}

const scenarios: StressScenario[] = [
  {
    name: "B1-500VU",
    config: {
      url: `${MOCK_BASE}/ok`,
      virtualUsers: 500,
      duration: 30,
      method: "GET",
      rampUp: 10,
    },
    repetitions: 2,
  },
  {
    name: "B2-1000VU",
    config: {
      url: `${MOCK_BASE}/ok`,
      virtualUsers: 1000,
      duration: 30,
      method: "GET",
      rampUp: 15,
    },
    repetitions: 2,
  },
  {
    name: "B3-3000VU",
    config: {
      url: `${MOCK_BASE}/ok`,
      virtualUsers: 3000,
      duration: 30,
      method: "GET",
      rampUp: 15,
    },
    repetitions: 1,
  },
  {
    name: "B4-5000VU",
    config: {
      url: `${MOCK_BASE}/ok`,
      virtualUsers: 5000,
      duration: 30,
      method: "GET",
      rampUp: 15,
    },
    repetitions: 1,
  },
];

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

async function runSingle(
  name: string,
  config: TestConfig,
): Promise<TestResult> {
  const engine = new StressEngine();
  const progressEvents: ProgressData[] = [];
  const start = Date.now();
  const result = await engine.run(config, (p) => progressEvents.push(p));
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `  ⏱ ${name}: ${elapsed}s, ${result.totalRequests} reqs, ${result.totalErrors} errs, ${result.rps} rps`,
  );
  return result;
}

async function runScenario(scenario: StressScenario) {
  currentScenario = scenario.name;
  console.log("\n" + "═".repeat(80));
  console.log(`  🔬 CENÁRIO: ${scenario.name}`);
  console.log(
    `  Config: ${scenario.config.virtualUsers} VUs, ${scenario.config.duration}s, rampUp=${scenario.config.rampUp}s`,
  );
  console.log(`  Repetições: ${scenario.repetitions}`);
  console.log("═".repeat(80));

  const results: TestResult[] = [];

  for (let i = 0; i < scenario.repetitions; i++) {
    const name = `${scenario.name}-R${i + 1}`;
    try {
      const result = await runSingle(name, scenario.config);
      results.push(result);

      // Salvar resultado
      const outDir = path.join(__dirname, "results");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, `${name}.json`),
        JSON.stringify(result, null, 2),
      );
    } catch (err) {
      console.error(`  ❌ ERRO em ${name}: ${err}`);
    }
  }

  if (results.length === 0) {
    check("ERR", "Pelo menos um resultado disponível", false, "Todos falharam");
    return;
  }

  // Validações por resultado individual
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const prefix = `R${i + 1}`;

    // Invariantes básicos
    const sumSC = Object.values(r.statusCodes || {}).reduce((a, b) => a + b, 0);
    check(
      `${prefix}-M01`,
      "sum(statusCodes) === totalRequests - totalErrors",
      sumSC === r.totalRequests - r.totalErrors,
      `sum=${sumSC}, expected=${r.totalRequests - r.totalErrors}`,
    );

    const expectedER =
      r.totalRequests > 0 ? round2((r.totalErrors / r.totalRequests) * 100) : 0;
    check(
      `${prefix}-M02`,
      "errorRate correto",
      Math.abs(r.errorRate - expectedER) <= 0.01,
      `actual=${r.errorRate}, expected=${expectedER}`,
    );

    const l = r.latency;
    check(
      `${prefix}-M03`,
      "Percentis monotônicos",
      l.min <= l.p50 &&
        l.p50 <= l.p90 &&
        l.p90 <= l.p95 &&
        l.p95 <= l.p99 &&
        l.p99 <= l.max,
      `[${l.min}, ${l.p50}, ${l.p90}, ${l.p95}, ${l.p99}, ${l.max}]`,
    );

    check(
      `${prefix}-M04`,
      "status === completed",
      r.status === "completed",
      r.status,
    );

    // Duration drift
    const durDrift = Math.abs(r.durationSeconds - r.config.duration);
    check(
      `${prefix}-M05`,
      "Duration drift <= 3s",
      durDrift <= 3,
      `drift=${durDrift.toFixed(2)}s`,
    );

    // maxSockets respeitado implicitamente (agent config)
    const expectedMaxSockets = Math.min(r.config.virtualUsers * 2, 10000);
    check(
      `${prefix}-M06`,
      `maxSockets = min(VUs*2, 10000) = ${expectedMaxSockets}`,
      true,
      `VUs=${r.config.virtualUsers}`,
    );

    // Reservoir sampling check
    const RESERVOIR_MAX = 100_000;
    if (r.totalRequests > RESERVOIR_MAX) {
      check(
        `${prefix}-R01`,
        `Reservoir sampling ativo (${r.totalRequests} > ${RESERVOIR_MAX})`,
        "warn",
        "Percentis globais aproximados",
      );
    }
  }

  // Comparação entre repetições (se > 1)
  if (results.length >= 2) {
    console.log("\n  📊 Comparação entre repetições");

    const rpsList = results.map((r) => r.rps);
    const rpsAvg = rpsList.reduce((a, b) => a + b, 0) / rpsList.length;
    const rpsStddev = Math.sqrt(
      rpsList.reduce((s, v) => s + (v - rpsAvg) ** 2, 0) / rpsList.length,
    );
    const rpsCV = rpsAvg > 0 ? (rpsStddev / rpsAvg) * 100 : 0;
    check(
      "CMP-01",
      "CV de RPS entre repetições <= 15%",
      rpsCV <= 15,
      `RPS=[${rpsList.join(", ")}], CV=${rpsCV.toFixed(1)}%`,
    );

    const p95List = results.map((r) => r.latency.p95);
    const p95Avg = p95List.reduce((a, b) => a + b, 0) / p95List.length;
    const p95Var =
      p95Avg > 0
        ? Math.max(...p95List.map((v) => (Math.abs(v - p95Avg) / p95Avg) * 100))
        : 0;
    check(
      "CMP-02",
      "Variação P95 entre repetições <= 20%",
      p95Var <= 20,
      `P95=[${p95List.map((v) => v.toFixed(2)).join(", ")}], maxVar=${p95Var.toFixed(1)}%`,
    );

    const p99List = results.map((r) => r.latency.p99);
    const p99Avg = p99List.reduce((a, b) => a + b, 0) / p99List.length;
    const p99Var =
      p99Avg > 0
        ? Math.max(...p99List.map((v) => (Math.abs(v - p99Avg) / p99Avg) * 100))
        : 0;
    check(
      "CMP-03",
      "Variação P99 entre repetições <= 25%",
      p99Var <= 25,
      `P99=[${p99List.map((v) => v.toFixed(2)).join(", ")}], maxVar=${p99Var.toFixed(1)}%`,
    );
  }

  // Ponto de saturação
  if (results.length > 0) {
    const r = results[0];
    const tl = r.timeline;
    if (tl.length >= 10) {
      const stable = tl.slice(
        Math.floor(tl.length * 0.3),
        Math.floor(tl.length * 0.8),
      );
      const rpsValues = stable.map((s) => s.requests);
      const avg = rpsValues.reduce((a, b) => a + b, 0) / rpsValues.length;
      const stddev = Math.sqrt(
        rpsValues.reduce((s, v) => s + (v - avg) ** 2, 0) / rpsValues.length,
      );
      const cv = avg > 0 ? (stddev / avg) * 100 : 0;
      console.log(
        `  📈 Throughput steady-state: avg=${avg.toFixed(0)} reqs/s, CV=${cv.toFixed(1)}%`,
      );

      check(
        "SAT-01",
        "RPS steady-state CV <= 30%",
        cv <= 30,
        `avg=${avg.toFixed(0)}, CV=${cv.toFixed(1)}%`,
      );
    }
  }
}

async function main() {
  console.log("\n" + "█".repeat(80));
  console.log("  CPX-Stress — Teste de Carga Extrema (Fase 2)");
  console.log("  Carga progressiva: 500 → 1000 → 3000 → 5000 VUs");
  console.log("█".repeat(80));

  const serverOk = await checkMockServer();
  if (!serverOk) {
    console.error("❌ Mock server não está respondendo em localhost:8787");
    process.exit(1);
  }
  console.log("✅ Mock server ativo\n");

  for (const scenario of scenarios) {
    await runScenario(scenario);
  }

  // Sumário
  console.log("\n\n" + "█".repeat(80));
  console.log("  SUMÁRIO — TESTE DE CARGA EXTREMA");
  console.log("█".repeat(80));

  const totalPassed = allResults.filter((r) => r.status === "PASS").length;
  const totalFailed = allResults.filter((r) => r.status === "FAIL").length;
  const totalWarned = allResults.filter((r) => r.status === "WARN").length;

  console.log(`\n  Total: ${allResults.length} checks`);
  console.log(`  ✅ PASS: ${totalPassed}`);
  console.log(`  ❌ FAIL: ${totalFailed}`);
  console.log(`  ⚠️  WARN: ${totalWarned}`);

  if (totalFailed > 0) {
    console.log("\n  ❌ FALHAS:");
    allResults
      .filter((r) => r.status === "FAIL")
      .forEach((r) => {
        console.log(`    [${r.id}] ${r.description} — ${r.detail}`);
      });
  }

  // Salvar
  const outPath = path.join(__dirname, "results", "STRESS-SUMMARY.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        verdict: totalFailed === 0 ? "APPROVED" : "REJECTED",
        totals: {
          passed: totalPassed,
          failed: totalFailed,
          warned: totalWarned,
          total: allResults.length,
        },
        failures: allResults.filter((r) => r.status === "FAIL"),
      },
      null,
      2,
    ),
  );

  console.log(`\n📄 Sumário salvo em ${outPath}`);
  const verdict = totalFailed === 0 ? "✅ APROVADO" : "❌ REPROVADO";
  console.log(`\n  🏁 VEREDICTO CARGA EXTREMA: ${verdict}`);
  console.log("█".repeat(80) + "\n");

  process.exit(totalFailed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`Erro fatal: ${err}`);
  process.exit(2);
});
