/**
 * Harness de convergência entre CPX, k6, Locust e JMeter.
 *
 * Objetivo:
 * - Executar o mesmo fluxo determinístico nas engines disponíveis
 * - Comparar distribuição por operação em cenário estável
 * - Confirmar comportamento de falha lógica por operação em mock controlado
 */

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

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { runJMeter, isJMeterAvailable } from "../electron/engine/jmeter-runner";
import { runK6, isK6Available } from "../electron/engine/k6-runner";
import { runLocust, isLocustAvailable } from "../electron/engine/locust-runner";
import { StressEngine } from "../electron/engine/stress-engine";
import type { TestConfig, TestResult } from "../electron/engine/stress-engine";
import type {
  JMeterSummary,
  K6Summary,
  LocustSummary,
} from "../src/types";
import {
  buildJMeterConfigFromTestConfig,
  buildK6ConfigFromTestConfig,
  buildLocustConfigFromTestConfig,
} from "../src/shared/external-benchmark-configs";

type EngineName = "cpx" | "k6" | "locust" | "jmeter";
type CheckStatus = "PASS" | "FAIL" | "WARN";

interface ComparableOperationStats {
  name: string;
  requests: number;
  errors: number;
  logicalFailures: number;
  statusCodes: Record<string, number>;
}

interface ComparableEngineResult {
  engine: EngineName;
  totalReqs: number;
  duration: number;
  operationStats: Record<string, ComparableOperationStats>;
  raw: unknown;
}

interface CheckResult {
  id: string;
  status: CheckStatus;
  description: string;
  detail: string;
}

const MOCK_BASE = "http://localhost:8787";
const LOGIN_OP = "Página de Login";
const AUTH_OP = "Autenticar Sessão";
const ALPHA_OP = "Módulo Alpha";
const BETA_OP = "Módulo Beta";
const REQUIRED_OPS = [LOGIN_OP, AUTH_OP, ALPHA_OP, BETA_OP];
const checks: CheckResult[] = [];

function recordCheck(
  id: string,
  description: string,
  condition: boolean,
  detail: string,
  warnOnly = false,
): void {
  const status: CheckStatus = condition ? "PASS" : warnOnly ? "WARN" : "FAIL";
  checks.push({ id, status, description, detail });
  const prefix = status === "PASS" ? "✅" : status === "WARN" ? "⚠️" : "❌";
  console.log(`  ${prefix} [${id}] ${description} — ${detail}`);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function httpGetJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body || "{}"));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error("Timeout ao chamar mock server."));
    });
  });
}

async function resetParityState(): Promise<void> {
  await httpGetJson(`${MOCK_BASE}/parity/reset`);
}

async function checkMockServer(): Promise<boolean> {
  try {
    await httpGetJson(`${MOCK_BASE}/stats`);
    return true;
  } catch {
    return false;
  }
}

function buildParityConfig(variant: "stable" | "invalid-beta"): TestConfig {
  return {
    url: `${MOCK_BASE}/parity/login`,
    virtualUsers: 4,
    duration: 6,
    method: "GET",
    flowSelectionMode: "deterministic",
    operations: [
      {
        name: LOGIN_OP,
        url: `${MOCK_BASE}/parity/login`,
        method: "GET",
        extract: {
          LOGIN_CTRL: "CTRL=(\\d+)",
        },
        validation: {
          rejectLoginLikeContent: false,
        },
      },
      {
        name: AUTH_OP,
        url: `${MOCK_BASE}/parity/auth?CTRL={{LOGIN_CTRL}}`,
        method: "POST",
        captureSession: true,
        extract: {
          SESSION_CTRL: "CTRL=(\\d+)",
        },
        validation: {
          expectedAnyText: ["Tutorial do MisterT"],
        },
      },
      {
        name: ALPHA_OP,
        moduleGroup: "Alpha",
        url: `${MOCK_BASE}/parity/module/alpha?CTRL={{SESSION_CTRL}}&variant=${variant}`,
        method: "GET",
        validation: {
          expectedAnyText: ["Alpha concluido"],
        },
      },
      {
        name: BETA_OP,
        moduleGroup: "Beta",
        url: `${MOCK_BASE}/parity/module/beta?CTRL={{SESSION_CTRL}}&variant=${variant}`,
        method: "GET",
        validation: {
          expectedAnyText: ["Beta concluido"],
        },
      },
    ],
  };
}

function normalizeCpxResult(result: TestResult): ComparableEngineResult {
  const operationStats = Object.fromEntries(
    Object.values(result.operationMetrics || {}).map((operation) => [
      operation.name,
      {
        name: operation.name,
        requests: operation.totalRequests,
        errors: operation.totalErrors,
        logicalFailures: operation.sessionMetrics?.sessionFailures || 0,
        statusCodes: operation.statusCodes || {},
      },
    ]),
  );

  return {
    engine: "cpx",
    totalReqs: result.totalRequests,
    duration: result.config.duration,
    operationStats,
    raw: result,
  };
}

function normalizeExternalSummary(
  engine: Exclude<EngineName, "cpx">,
  summary: K6Summary | LocustSummary | JMeterSummary,
): ComparableEngineResult {
  return {
    engine,
    totalReqs: summary.totalReqs,
    duration: summary.duration,
    operationStats: summary.operationStats || {},
    raw: summary,
  };
}

function getOp(
  result: ComparableEngineResult,
  operationName: string,
): ComparableOperationStats {
  return (
    result.operationStats[operationName] || {
      name: operationName,
      requests: 0,
      errors: 0,
      logicalFailures: 0,
      statusCodes: {},
    }
  );
}

function moduleShare(
  result: ComparableEngineResult,
  operationName: string,
): number {
  const alpha = getOp(result, ALPHA_OP).requests;
  const beta = getOp(result, BETA_OP).requests;
  const total = alpha + beta;
  return total > 0 ? getOp(result, operationName).requests / total : 0;
}

function growthFromStable(
  current: ComparableEngineResult,
  stable: ComparableEngineResult,
  operationName: string,
): number {
  return getOp(current, operationName).requests - getOp(stable, operationName).requests;
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

async function runScenario(
  scenarioName: string,
  config: TestConfig,
): Promise<Record<EngineName, ComparableEngineResult>> {
  const results: Partial<Record<EngineName, ComparableEngineResult>> = {};

  await resetParityState();

  const engine = new StressEngine();
  const cpxResult = await engine.run(config, () => {});
  results.cpx = normalizeCpxResult(cpxResult);

  if (isK6Available()) {
    const k6 = await runK6(buildK6ConfigFromTestConfig(config));
    results.k6 = normalizeExternalSummary("k6", k6);
  } else {
    recordCheck(
      `${scenarioName}-k6-skip`,
      "k6 disponível para comparação",
      false,
      "Binário do k6 não encontrado no ambiente atual.",
      true,
    );
  }

  if (isLocustAvailable()) {
    const locust = await runLocust(buildLocustConfigFromTestConfig(config));
    results.locust = normalizeExternalSummary("locust", locust);
  } else {
    recordCheck(
      `${scenarioName}-locust-skip`,
      "Locust disponível para comparação",
      false,
      "Binário do Locust não encontrado no ambiente atual.",
      true,
    );
  }

  if (isJMeterAvailable()) {
    const jmeter = await runJMeter(buildJMeterConfigFromTestConfig(config));
    results.jmeter = normalizeExternalSummary("jmeter", jmeter);
  } else {
    recordCheck(
      `${scenarioName}-jmeter-skip`,
      "JMeter disponível para comparação",
      false,
      "Binário do JMeter não encontrado no ambiente atual.",
      true,
    );
  }

  const outputDir = path.join(__dirname, "results");
  ensureDir(outputDir);
  fs.writeFileSync(
    path.join(outputDir, `benchmark-convergence-${scenarioName}.json`),
    JSON.stringify(results, null, 2),
    "utf8",
  );

  return results as Record<EngineName, ComparableEngineResult>;
}

function validateStableScenario(
  results: Record<EngineName, ComparableEngineResult>,
  config: TestConfig,
): void {
  const engines = Object.values(results);
  const cpx = results.cpx;

  recordCheck(
    "stable-available-engines",
    "Há pelo menos uma engine externa disponível",
    engines.length > 1,
    `engines=${engines.map((item) => item.engine).join(", ")}`,
    true,
  );

  for (const result of engines) {
    for (const operationName of REQUIRED_OPS) {
      const op = getOp(result, operationName);
      recordCheck(
        `stable-${result.engine}-${operationName}`,
        `${result.engine} registrou a operação ${operationName}`,
        op.requests > 0,
        `requests=${op.requests}`,
      );
    }

    const login = getOp(result, LOGIN_OP);
    const auth = getOp(result, AUTH_OP);
    const alpha = getOp(result, ALPHA_OP);
    const beta = getOp(result, BETA_OP);
    const moduleDelta =
      Math.abs(alpha.requests - beta.requests) /
      Math.max(1, Math.max(alpha.requests, beta.requests));
    const moduleErrors = alpha.errors + beta.errors;

    recordCheck(
      `stable-${result.engine}-auth-match`,
      `${result.engine} manteve login/auth alinhados no fluxo estável`,
      login.requests === auth.requests && login.requests >= config.virtualUsers,
      `login=${login.requests}, auth=${auth.requests}, vus=${config.virtualUsers}`,
    );
    recordCheck(
      `stable-${result.engine}-module-balance`,
      `${result.engine} manteve round-robin equilibrado entre Alpha e Beta`,
      moduleDelta <= 0.15,
      `alpha=${alpha.requests}, beta=${beta.requests}, delta=${round2(moduleDelta)}`,
    );
    recordCheck(
      `stable-${result.engine}-module-errors`,
      `${result.engine} não apresentou falhas lógicas nos módulos estáveis`,
      moduleErrors === 0,
      `alphaErrors=${alpha.errors}, betaErrors=${beta.errors}`,
    );
  }

  for (const [engineName, result] of Object.entries(results)) {
    if (engineName === "cpx") continue;

    const alphaShareDiff = Math.abs(moduleShare(result, ALPHA_OP) - moduleShare(cpx, ALPHA_OP));
    const betaShareDiff = Math.abs(moduleShare(result, BETA_OP) - moduleShare(cpx, BETA_OP));
    const authDelta = Math.abs(getOp(result, AUTH_OP).requests - getOp(cpx, AUTH_OP).requests);

    recordCheck(
      `stable-${engineName}-alpha-share`,
      `${engineName} converge com o CPX na participação do módulo Alpha`,
      alphaShareDiff <= 0.1,
      `diff=${round2(alphaShareDiff)}`,
    );
    recordCheck(
      `stable-${engineName}-beta-share`,
      `${engineName} converge com o CPX na participação do módulo Beta`,
      betaShareDiff <= 0.1,
      `diff=${round2(betaShareDiff)}`,
    );
    recordCheck(
      `stable-${engineName}-auth-delta`,
      `${engineName} converge com o CPX na quantidade de autenticações`,
      authDelta <= config.virtualUsers,
      `diff=${authDelta}`,
    );
  }
}

function validateInvalidBetaScenario(
  results: Record<EngineName, ComparableEngineResult>,
  stableBaseline: Record<EngineName, ComparableEngineResult>,
): void {
  const cpx = results.cpx;

  for (const [engineName, result] of Object.entries(results) as Array<[
    EngineName,
    ComparableEngineResult,
  ]>) {
    const stable = stableBaseline[engineName];
    const beta = getOp(result, BETA_OP);
    const auth = getOp(result, AUTH_OP);
    const login = getOp(result, LOGIN_OP);
    const authGrowth = growthFromStable(result, stable, AUTH_OP);
    const betaFailures = Math.max(beta.logicalFailures, beta.errors);
    const allowedShutdownSkew = Math.max(1, getOp(stable, LOGIN_OP).requests);

    recordCheck(
      `invalid-beta-${engineName}-beta-errors`,
      `${engineName} detectou falha lógica no módulo Beta`,
      beta.errors > 0 || beta.logicalFailures > 0,
      `errors=${beta.errors}, logical=${beta.logicalFailures}`,
    );
    recordCheck(
      `invalid-beta-${engineName}-reauth`,
      `${engineName} aumentou autenticações após a falha lógica`,
      authGrowth > 0,
      `stable=${getOp(stable, AUTH_OP).requests}, current=${auth.requests}, growth=${authGrowth}`,
    );
    recordCheck(
      `invalid-beta-${engineName}-login-auth-match`,
      `${engineName} manteve login/auth alinhados após reautenticação dentro do skew de desligamento`,
      Math.abs(login.requests - auth.requests) <= allowedShutdownSkew,
      `login=${login.requests}, auth=${auth.requests}, allowedSkew=${allowedShutdownSkew}`,
    );
    recordCheck(
      `invalid-beta-${engineName}-reauth-ratio`,
      `${engineName} reautenticou aproximadamente uma vez por falha lógica do Beta`,
      Math.abs(authGrowth - betaFailures) <= Math.max(2, round2(betaFailures * 0.1)),
      `authGrowth=${authGrowth}, betaFailures=${betaFailures}`,
    );
  }

  const cpxBeta = getOp(cpx, BETA_OP);
  const cpxBetaErrorShare = cpxBeta.requests > 0 ? cpxBeta.errors / cpxBeta.requests : 0;
  const cpxAuthGrowth = growthFromStable(results.cpx, stableBaseline.cpx, AUTH_OP);
  const cpxReauthRatio = safeRatio(cpxAuthGrowth, Math.max(cpxBeta.logicalFailures, cpxBeta.errors));

  for (const [engineName, result] of Object.entries(results)) {
    if (engineName === "cpx") continue;
    const beta = getOp(result, BETA_OP);
    const betaErrorShare = beta.requests > 0 ? beta.errors / beta.requests : 0;
    const authGrowth = growthFromStable(
      result,
      stableBaseline[engineName as EngineName],
      AUTH_OP,
    );
    const reauthRatio = safeRatio(authGrowth, Math.max(beta.logicalFailures, beta.errors));

    recordCheck(
      `invalid-beta-${engineName}-beta-share`,
      `${engineName} converge com o CPX na taxa de erro do módulo Beta`,
      Math.abs(betaErrorShare - cpxBetaErrorShare) <= 0.2,
      `diff=${round2(Math.abs(betaErrorShare - cpxBetaErrorShare))}`,
    );
    recordCheck(
      `invalid-beta-${engineName}-reauth-parity`,
      `${engineName} converge com o CPX na proporção reauth/falha lógica`,
      Math.abs(reauthRatio - cpxReauthRatio) <= 0.15,
      `diff=${round2(Math.abs(reauthRatio - cpxReauthRatio))}, cpxRatio=${round2(cpxReauthRatio)}, engineRatio=${round2(reauthRatio)}`,
    );
  }
}

async function main(): Promise<void> {
  console.log("\n" + "█".repeat(80));
  console.log("  CPX-Stress — Benchmark Convergence Harness");
  console.log("█".repeat(80));

  const serverOk = await checkMockServer();
  if (!serverOk) {
    console.error("❌ Mock server não está respondendo em localhost:8787");
    console.error("   Execute: node audit/mock-server.js 8787");
    process.exit(1);
  }

  console.log("\n▶ Cenário estável (round-robin por operação)");
  const stableConfig = buildParityConfig("stable");
  const stableResults = await runScenario("stable", stableConfig);
  validateStableScenario(stableResults, stableConfig);

  console.log("\n▶ Cenário com falha lógica no Beta");
  const invalidBetaConfig = buildParityConfig("invalid-beta");
  const invalidBetaResults = await runScenario("invalid-beta", invalidBetaConfig);
  validateInvalidBetaScenario(invalidBetaResults, stableResults);

  const passed = checks.filter((item) => item.status === "PASS").length;
  const failed = checks.filter((item) => item.status === "FAIL").length;
  const warned = checks.filter((item) => item.status === "WARN").length;

  console.log("\n" + "═".repeat(80));
  console.log(`PASS=${passed} | FAIL=${failed} | WARN=${warned}`);

  if (failed > 0) {
    console.log("\nFalhas:");
    for (const failure of checks.filter((item) => item.status === "FAIL")) {
      console.log(`- [${failure.id}] ${failure.description} — ${failure.detail}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[CPX-Stress] Falha no harness de convergência:", error);
  process.exit(1);
});
