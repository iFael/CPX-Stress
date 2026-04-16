/**
 * Harness de convergência entre CPX, k6, Locust e JMeter.
 *
 * Objetivo:
 * - Executar fluxos determinísticos nas engines disponíveis
 * - Comparar semântica por operação em cenários controlados
 * - Validar equivalência de falhas lógicas e de rede antes de usar alvo real
 */

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
type ScenarioName =
  | "stable"
  | "invalid-beta"
  | "extractor-missing-alpha"
  | "expired-beta"
  | "timeout-beta"
  | "connection-beta";

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
  engineError?: string;
}

interface CheckResult {
  id: string;
  status: CheckStatus;
  description: string;
  detail: string;
}

type ScenarioResults = Partial<Record<EngineName, ComparableEngineResult>>;

process.env.STRESSFLOW_ALLOW_INTERNAL = "true";

const MOCK_BASE = "http://127.0.0.1:8787";
const UNREACHABLE_BASE = "http://127.0.0.1:65534";
const PERSIST_RESULTS = process.env.CPX_SAVE_CONVERGENCE_RESULTS === "1";
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

function listResults(results: ScenarioResults): ComparableEngineResult[] {
  return Object.values(results).filter(
    (result): result is ComparableEngineResult => result !== undefined,
  );
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

function buildParityConfig(scenarioName: ScenarioName): TestConfig {
  const betaVariantMap: Record<ScenarioName, string> = {
    stable: "stable",
    "invalid-beta": "invalid-beta",
    "extractor-missing-alpha": "stable",
    "expired-beta": "expired-beta",
    "timeout-beta": "timeout",
    "connection-beta": "stable",
  };
  const alphaVariant =
    scenarioName === "extractor-missing-alpha" ? "missing-extractor" : "stable";
  const betaVariant = betaVariantMap[scenarioName];
  const betaUrl =
    scenarioName === "connection-beta"
      ? `${UNREACHABLE_BASE}/parity/module/beta?CTRL={{SESSION_CTRL}}`
      : `${MOCK_BASE}/parity/module/beta?CTRL={{SESSION_CTRL}}&variant=${betaVariant}`;
  const betaExpectedAnyText =
    scenarioName === "timeout-beta" || scenarioName === "connection-beta"
      ? undefined
      : ["Beta concluido"];

  return {
    url: `${MOCK_BASE}/parity/login`,
    virtualUsers: 4,
    duration:
      scenarioName === "timeout-beta" || scenarioName === "connection-beta" ? 3 : 4,
    method: "GET",
    flowSelectionMode: "deterministic",
    requestTimeoutMs: scenarioName === "timeout-beta" ? 750 : 3000,
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
        url: `${MOCK_BASE}/parity/module/alpha?CTRL={{SESSION_CTRL}}&variant=${alphaVariant}`,
        method: "GET",
        extract:
          scenarioName === "extractor-missing-alpha"
            ? { ALPHA_TOKEN: "ALPHA_TOKEN=(\\d+)" }
            : undefined,
        validation: {
          expectedAnyText: ["Alpha concluido"],
        },
      },
      {
        name: BETA_OP,
        moduleGroup: "Beta",
        url: betaUrl,
        method: "GET",
        validation: {
          expectedAnyText: betaExpectedAnyText,
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

function totalFailureCount(operation: ComparableOperationStats): number {
  return Math.max(operation.logicalFailures, operation.errors);
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

function failureShare(result: ComparableEngineResult, operationName: string): number {
  const operation = getOp(result, operationName);
  return operation.requests > 0 ? totalFailureCount(operation) / operation.requests : 0;
}

function errorShare(result: ComparableEngineResult, operationName: string): number {
  const operation = getOp(result, operationName);
  return operation.requests > 0 ? operation.errors / operation.requests : 0;
}

function writeScenarioOutput(scenarioName: ScenarioName, results: ScenarioResults): void {
  if (!PERSIST_RESULTS) {
    return;
  }

  const outputDir = path.join(__dirname, "results");
  ensureDir(outputDir);
  fs.writeFileSync(
    path.join(outputDir, `benchmark-convergence-${scenarioName}.json`),
    JSON.stringify(results, null, 2),
    "utf8",
  );
}

async function runScenario(
  scenarioName: ScenarioName,
  config: TestConfig,
): Promise<ScenarioResults> {
  const results: ScenarioResults = {};

  await resetParityState();

  const engine = new StressEngine();
  results.cpx = normalizeCpxResult(await engine.run(config, () => {}));

  if (isK6Available()) {
    try {
      const k6 = await runK6(buildK6ConfigFromTestConfig(config));
      results.k6 = normalizeExternalSummary("k6", k6);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordCheck(
        `${scenarioName}-k6-execution`,
        `k6 executou o cenário ${scenarioName}`,
        false,
        message,
      );
      results.k6 = {
        engine: "k6",
        totalReqs: 0,
        duration: config.duration,
        operationStats: {},
        raw: null,
        engineError: message,
      };
    }
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
    try {
      const locust = await runLocust(buildLocustConfigFromTestConfig(config));
      results.locust = normalizeExternalSummary("locust", locust);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordCheck(
        `${scenarioName}-locust-execution`,
        `Locust executou o cenário ${scenarioName}`,
        false,
        message,
      );
      results.locust = {
        engine: "locust",
        totalReqs: 0,
        duration: config.duration,
        operationStats: {},
        raw: null,
        engineError: message,
      };
    }
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
    try {
      const jmeter = await runJMeter(buildJMeterConfigFromTestConfig(config));
      results.jmeter = normalizeExternalSummary("jmeter", jmeter);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordCheck(
        `${scenarioName}-jmeter-execution`,
        `JMeter executou o cenário ${scenarioName}`,
        false,
        message,
      );
      results.jmeter = {
        engine: "jmeter",
        totalReqs: 0,
        duration: config.duration,
        operationStats: {},
        raw: null,
        engineError: message,
      };
    }
  } else {
    recordCheck(
      `${scenarioName}-jmeter-skip`,
      "JMeter disponível para comparação",
      false,
      "Binário do JMeter não encontrado no ambiente atual.",
      true,
    );
  }

  writeScenarioOutput(scenarioName, results);
  return results;
}

function validateStableScenario(results: ScenarioResults, config: TestConfig): void {
  const engines = listResults(results);
  const cpx = results.cpx;
  if (!cpx) {
    throw new Error("Resultado do CPX ausente no cenário estável.");
  }

  recordCheck(
    "stable-available-engines",
    "Há pelo menos uma engine externa disponível",
    engines.length > 1,
    `engines=${engines.map((item) => item.engine).join(", ")}`,
    true,
  );

  for (const result of engines) {
    for (const operationName of REQUIRED_OPS) {
      const operation = getOp(result, operationName);
      recordCheck(
        `stable-${result.engine}-${operationName}`,
        `${result.engine} registrou a operação ${operationName}`,
        operation.requests > 0,
        `requests=${operation.requests}`,
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
    if (!result || engineName === "cpx") continue;

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

function validateLogicalFailureScenario(
  scenarioId: ScenarioName,
  scenarioLabel: string,
  operationName: string,
  results: ScenarioResults,
  stableBaseline: ScenarioResults,
): void {
  const cpx = results.cpx;
  const stableCpx = stableBaseline.cpx;
  if (!cpx || !stableCpx) {
    throw new Error(`Baseline do CPX ausente no cenário ${scenarioId}.`);
  }

  for (const result of listResults(results)) {
    const stable = stableBaseline[result.engine];
    if (!stable) continue;

    const targetOperation = getOp(result, operationName);
    const auth = getOp(result, AUTH_OP);
    const login = getOp(result, LOGIN_OP);
    const authGrowth = growthFromStable(result, stable, AUTH_OP);
    const failureCount = totalFailureCount(targetOperation);
    const allowedSkew = Math.max(1, getOp(stable, LOGIN_OP).requests);

    recordCheck(
      `${scenarioId}-${result.engine}-requests`,
      `${result.engine} registrou tentativas de ${operationName}`,
      targetOperation.requests > 0,
      `requests=${targetOperation.requests}`,
    );
    recordCheck(
      `${scenarioId}-${result.engine}-failures`,
      `${result.engine} detectou ${scenarioLabel}`,
      failureCount > 0,
      `errors=${targetOperation.errors}, logical=${targetOperation.logicalFailures}`,
    );
    recordCheck(
      `${scenarioId}-${result.engine}-failure-share`,
      `${result.engine} falhou de forma consistente em ${operationName}`,
      failureShare(result, operationName) >= 0.95,
      `share=${round2(failureShare(result, operationName))}`,
    );
    recordCheck(
      `${scenarioId}-${result.engine}-reauth`,
      `${result.engine} reautenticou após ${scenarioLabel}`,
      authGrowth > 0,
      `stable=${getOp(stable, AUTH_OP).requests}, current=${auth.requests}, growth=${authGrowth}`,
    );
    recordCheck(
      `${scenarioId}-${result.engine}-login-auth-match`,
      `${result.engine} manteve login/auth alinhados dentro do skew de desligamento`,
      Math.abs(login.requests - auth.requests) <= allowedSkew,
      `login=${login.requests}, auth=${auth.requests}, allowedSkew=${allowedSkew}`,
    );
    recordCheck(
      `${scenarioId}-${result.engine}-reauth-ratio`,
      `${result.engine} reautenticou aproximadamente uma vez por falha de ${operationName}`,
      Math.abs(authGrowth - failureCount) <= Math.max(2, round2(failureCount * 0.15)),
      `authGrowth=${authGrowth}, failures=${failureCount}`,
    );
  }

  const cpxOperation = getOp(cpx, operationName);
  const cpxFailureShare = failureShare(cpx, operationName);
  const cpxAuthGrowth = growthFromStable(cpx, stableCpx, AUTH_OP);
  const cpxReauthRatio = safeRatio(cpxAuthGrowth, totalFailureCount(cpxOperation));

  for (const [engineName, result] of Object.entries(results)) {
    if (!result || engineName === "cpx") continue;

    const stable = stableBaseline[engineName as EngineName];
    if (!stable) continue;
    const operation = getOp(result, operationName);
    const authGrowth = growthFromStable(result, stable, AUTH_OP);
    const engineFailureShare = failureShare(result, operationName);
    const reauthRatio = safeRatio(authGrowth, totalFailureCount(operation));

    recordCheck(
      `${scenarioId}-${engineName}-failure-parity`,
      `${engineName} converge com o CPX na taxa de falha de ${operationName}`,
      Math.abs(engineFailureShare - cpxFailureShare) <= 0.2,
      `diff=${round2(Math.abs(engineFailureShare - cpxFailureShare))}`,
    );
    recordCheck(
      `${scenarioId}-${engineName}-reauth-parity`,
      `${engineName} converge com o CPX na proporção reauth/falha lógica`,
      Math.abs(reauthRatio - cpxReauthRatio) <= 0.2,
      `diff=${round2(Math.abs(reauthRatio - cpxReauthRatio))}, cpxRatio=${round2(cpxReauthRatio)}, engineRatio=${round2(reauthRatio)}`,
    );
  }
}

function validateNetworkFailureScenario(
  scenarioId: ScenarioName,
  scenarioLabel: string,
  operationName: string,
  results: ScenarioResults,
  stableBaseline: ScenarioResults,
): void {
  const cpx = results.cpx;
  const stableCpx = stableBaseline.cpx;
  if (!cpx || !stableCpx) {
    throw new Error(`Baseline do CPX ausente no cenário ${scenarioId}.`);
  }

  for (const result of listResults(results)) {
    const stable = stableBaseline[result.engine];
    if (!stable) continue;

    const targetOperation = getOp(result, operationName);
    const authGrowth = growthFromStable(result, stable, AUTH_OP);

    recordCheck(
      `${scenarioId}-${result.engine}-requests`,
      `${result.engine} registrou tentativas de ${operationName}`,
      targetOperation.requests > 0,
      `requests=${targetOperation.requests}`,
    );
    recordCheck(
      `${scenarioId}-${result.engine}-errors`,
      `${result.engine} detectou ${scenarioLabel}`,
      targetOperation.errors > 0,
      `errors=${targetOperation.errors}, logical=${targetOperation.logicalFailures}`,
    );
    recordCheck(
      `${scenarioId}-${result.engine}-error-share`,
      `${result.engine} falhou de forma consistente em ${operationName}`,
      errorShare(result, operationName) >= 0.95,
      `share=${round2(errorShare(result, operationName))}`,
    );
    recordCheck(
      `${scenarioId}-${result.engine}-no-reauth`,
      `${result.engine} não reautenticou após ${scenarioLabel}`,
      authGrowth <= 1,
      `authGrowth=${authGrowth}`,
    );
  }

  const cpxErrorShare = errorShare(cpx, operationName);
  const cpxAuthGrowth = growthFromStable(cpx, stableCpx, AUTH_OP);

  for (const [engineName, result] of Object.entries(results)) {
    if (!result || engineName === "cpx") continue;

    const stable = stableBaseline[engineName as EngineName];
    if (!stable) continue;
    const authGrowth = growthFromStable(result, stable, AUTH_OP);
    const engineErrorShare = errorShare(result, operationName);

    recordCheck(
      `${scenarioId}-${engineName}-error-parity`,
      `${engineName} converge com o CPX na taxa de erro de ${operationName}`,
      Math.abs(engineErrorShare - cpxErrorShare) <= 0.2,
      `diff=${round2(Math.abs(engineErrorShare - cpxErrorShare))}`,
    );
    recordCheck(
      `${scenarioId}-${engineName}-auth-parity`,
      `${engineName} converge com o CPX na ausência de reautenticação após ${scenarioLabel}`,
      Math.abs(authGrowth - cpxAuthGrowth) <= 1,
      `diff=${Math.abs(authGrowth - cpxAuthGrowth)}, cpxAuthGrowth=${cpxAuthGrowth}, engineAuthGrowth=${authGrowth}`,
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

  console.log("\n▶ Cenário com texto esperado ausente no Beta");
  const invalidBetaResults = await runScenario(
    "invalid-beta",
    buildParityConfig("invalid-beta"),
  );
  validateLogicalFailureScenario(
    "invalid-beta",
    "texto esperado ausente no Beta",
    BETA_OP,
    invalidBetaResults,
    stableResults,
  );

  console.log("\n▶ Cenário com extractor ausente no Alpha");
  const missingExtractorResults = await runScenario(
    "extractor-missing-alpha",
    buildParityConfig("extractor-missing-alpha"),
  );
  validateLogicalFailureScenario(
    "extractor-missing-alpha",
    "extractor ausente no Alpha",
    ALPHA_OP,
    missingExtractorResults,
    stableResults,
  );

  console.log("\n▶ Cenário com sessão expirada no Beta");
  const expiredBetaResults = await runScenario(
    "expired-beta",
    buildParityConfig("expired-beta"),
  );
  validateLogicalFailureScenario(
    "expired-beta",
    "sessão expirada no Beta",
    BETA_OP,
    expiredBetaResults,
    stableResults,
  );

  console.log("\n▶ Cenário com timeout no Beta");
  const timeoutBetaResults = await runScenario(
    "timeout-beta",
    buildParityConfig("timeout-beta"),
  );
  validateNetworkFailureScenario(
    "timeout-beta",
    "timeout no Beta",
    BETA_OP,
    timeoutBetaResults,
    stableResults,
  );

  console.log("\n▶ Cenário com falha de conexão no Beta");
  const connectionBetaResults = await runScenario(
    "connection-beta",
    buildParityConfig("connection-beta"),
  );
  validateNetworkFailureScenario(
    "connection-beta",
    "falha de conexão no Beta",
    BETA_OP,
    connectionBetaResults,
    stableResults,
  );

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