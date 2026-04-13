import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { CookieJar } from "./cookie-jar";
import type { TestConfig, TestOperation } from "./stress-engine";
import { validateTargetHost } from "./stress-engine";
import {
  buildValidationSnippet,
  detectLoginLikeContent,
  normalizeValidationText,
  type MistertValidationResult,
  type OperationValidationResult,
  type ValidationDimensionStatus,
} from "../../src/shared/mistert-validation";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_REDIRECT_HOPS = 5;
const BODY_LIMIT_BYTES = 2_097_152;
const ENV_PLACEHOLDER_PATTERN = /\{\{(STRESSFLOW_\w+)\}\}/g;
const GENERIC_PLACEHOLDER_PATTERN = /\{\{([^}]+)\}\}/g;

export interface ResolvedConfigWithEnv {
  config: TestConfig;
  missingKeys: string[];
}

interface RequestResult {
  statusCode: number;
  bodyText: string;
  finalUrl: URL;
  redirectCount: number;
}

function cloneHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  return headers ? { ...headers } : undefined;
}

function cloneOperations(operations?: TestOperation[]): TestOperation[] | undefined {
  if (!operations) return undefined;

  return operations.map((operation) => ({
    ...operation,
    headers: cloneHeaders(operation.headers),
    extract: operation.extract ? { ...operation.extract } : undefined,
    validation: operation.validation
      ? {
          expectedAnyText: operation.validation.expectedAnyText
            ? [...operation.validation.expectedAnyText]
            : undefined,
          rejectLoginLikeContent: operation.validation.rejectLoginLikeContent,
          rejectOnAnyText: operation.validation.rejectOnAnyText
            ? [...operation.validation.rejectOnAnyText]
            : undefined,
        }
      : undefined,
    navigation: operation.navigation
      ? {
          accessMode: operation.navigation.accessMode,
          notes: operation.navigation.notes,
          sourceAction: operation.navigation.sourceAction
            ? {
                kind: operation.navigation.sourceAction.kind,
                method: operation.navigation.sourceAction.method,
                submitControlName:
                  operation.navigation.sourceAction.submitControlName,
                submitControlValue:
                  operation.navigation.sourceAction.submitControlValue,
                fields: operation.navigation.sourceAction.fields
                  ? { ...operation.navigation.sourceAction.fields }
                  : undefined,
                description: operation.navigation.sourceAction.description,
              }
            : undefined,
        }
      : undefined,
  }));
}

function cloneConfig(config: TestConfig): TestConfig {
  return {
    ...config,
    headers: cloneHeaders(config.headers),
    operations: cloneOperations(config.operations),
  };
}

function resolveEnvPlaceholders(
  input: string,
  envVars: Record<string, string>,
  missingKeys: Set<string>,
): string {
  return input.replace(ENV_PLACEHOLDER_PATTERN, (_match, key: string) => {
    const value = envVars[key];
    if (!value || value.trim() === "") {
      missingKeys.add(key);
      return "";
    }
    return value;
  });
}

function resolveOperationEnvPlaceholders(
  operation: TestOperation,
  envVars: Record<string, string>,
  missingKeys: Set<string>,
): TestOperation {
  return {
    ...operation,
    url: resolveEnvPlaceholders(operation.url, envVars, missingKeys),
    body: operation.body
      ? resolveEnvPlaceholders(operation.body, envVars, missingKeys)
      : undefined,
    headers: operation.headers
      ? Object.fromEntries(
          Object.entries(operation.headers).map(([key, value]) => [
            key,
            resolveEnvPlaceholders(value, envVars, missingKeys),
          ]),
        )
      : undefined,
  };
}

export function resolveConfigEnvPlaceholders(
  config: TestConfig,
  envVars: Record<string, string>,
): ResolvedConfigWithEnv {
  const missingKeys = new Set<string>();
  const cloned = cloneConfig(config);

  const resolved: TestConfig = {
    ...cloned,
    url: resolveEnvPlaceholders(cloned.url, envVars, missingKeys),
    body: cloned.body
      ? resolveEnvPlaceholders(cloned.body, envVars, missingKeys)
      : undefined,
    headers: cloned.headers
      ? Object.fromEntries(
          Object.entries(cloned.headers).map(([key, value]) => [
            key,
            resolveEnvPlaceholders(value, envVars, missingKeys),
          ]),
        )
      : undefined,
    operations: cloned.operations?.map((operation) =>
      resolveOperationEnvPlaceholders(operation, envVars, missingKeys)
    ),
  };

  return {
    config: resolved,
    missingKeys: [...missingKeys].sort(),
  };
}

function resolveExtractVars(text: string, vars: Map<string, string>): string {
  if (vars.size === 0 || !text.includes("{{")) return text;

  return text.replace(GENERIC_PLACEHOLDER_PATTERN, (match, varName: string) => {
    return vars.get(varName) ?? match;
  });
}

function resolveExtractHeaders(
  headers: Record<string, string> | undefined,
  vars: Map<string, string>,
): Record<string, string> | undefined {
  if (!headers || vars.size === 0) return headers;

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      resolveExtractVars(value, vars),
    ]),
  );
}

function hasUnresolvedPlaceholders(text: string | undefined): boolean {
  return !!text && /\{\{[^}]+\}\}/.test(text);
}

async function makeSingleRequest(
  opts: {
    url: URL;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    cookieJar: CookieJar;
    timeoutMs: number;
  },
): Promise<{
  statusCode: number;
  bodyText: string;
  locationHeader?: string;
}> {
  return new Promise((resolve, reject) => {
    const isHttps = opts.url.protocol === "https:";
    const mod = isHttps ? https : http;
    const mergedHeaders: Record<string, string> = {
      "User-Agent": "CPX-Stress/1.0",
      Accept: "*/*",
      ...opts.headers,
    };

    const cookieHeader = opts.cookieJar.toCookieHeader(opts.url);
    if (cookieHeader) {
      mergedHeaders.Cookie = cookieHeader;
    }

    if (opts.body && opts.method !== "GET") {
      const hasContentType = Object.keys(mergedHeaders).some(
        (header) => header.toLowerCase() === "content-type",
      );
      if (!hasContentType) {
        mergedHeaders["Content-Type"] = "application/json";
      }
      mergedHeaders["Content-Length"] = Buffer.byteLength(opts.body).toString();
    }

    const req = mod.request(
      {
        hostname: opts.url.hostname,
        port: opts.url.port || (isHttps ? 443 : 80),
        path: opts.url.pathname + opts.url.search,
        method: opts.method,
        headers: mergedHeaders,
        timeout: opts.timeoutMs,
      },
      (res) => {
        const bodyChunks: Buffer[] = [];
        let collectedBytes = 0;
        const setCookieHeaders = res.headers["set-cookie"];

        if (setCookieHeaders) {
          opts.cookieJar.addFromSetCookieHeaders(setCookieHeaders);
        }

        res.on("data", (chunk: Buffer) => {
          if (collectedBytes >= BODY_LIMIT_BYTES) return;

          const remaining = BODY_LIMIT_BYTES - collectedBytes;
          const chunkSlice = chunk.subarray(0, remaining);
          bodyChunks.push(chunkSlice);
          collectedBytes += chunkSlice.length;
        });

        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            bodyText: Buffer.concat(bodyChunks).toString("utf-8"),
            locationHeader:
              typeof res.headers.location === "string"
                ? res.headers.location
                : undefined,
          });
        });

        res.on("error", reject);
      },
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("Request timeout"));
    });

    if (opts.body && opts.method !== "GET") {
      req.write(opts.body);
    }

    req.end();
  });
}

function isRedirectStatus(statusCode: number): boolean {
  return statusCode >= 300 && statusCode <= 308 && statusCode !== 304;
}

async function makeRequest(
  opts: {
    url: URL;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    cookieJar: CookieJar;
    timeoutMs: number;
  },
): Promise<RequestResult> {
  let currentUrl = opts.url;
  let currentMethod = opts.method;
  let currentBody = opts.body;
  let lastResult: Awaited<ReturnType<typeof makeSingleRequest>> | null = null;
  let redirectCount = 0;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    lastResult = await makeSingleRequest({
      ...opts,
      url: currentUrl,
      method: currentMethod,
      body: currentBody,
    });

    if (
      !isRedirectStatus(lastResult.statusCode) ||
      !lastResult.locationHeader ||
      hop === MAX_REDIRECT_HOPS
    ) {
      break;
    }

    redirectCount++;
    const redirectUrl = new URL(lastResult.locationHeader, currentUrl.toString());
    await validateTargetHost(redirectUrl.hostname);
    currentUrl = redirectUrl;

    if (lastResult.statusCode === 302 || lastResult.statusCode === 303) {
      currentMethod = "GET";
      currentBody = undefined;
    }
  }

  return {
    statusCode: lastResult?.statusCode ?? 0,
    bodyText: lastResult?.bodyText ?? "",
    finalUrl: currentUrl,
    redirectCount,
  };
}

function createSingleOperationConfig(config: TestConfig): TestOperation[] {
  if (config.operations && config.operations.length > 0) {
    return config.operations;
  }

  return [
    {
      name: "default",
      url: config.url,
      method: config.method,
      headers: config.headers,
      body: config.body,
      captureSession: false,
    },
  ];
}

function getExpectedTextMatches(
  normalizedBody: string,
  operation: TestOperation,
): string[] {
  const expectedAnyText = operation.validation?.expectedAnyText;
  if (!expectedAnyText || expectedAnyText.length === 0) return [];

  return expectedAnyText.filter((candidate) =>
    normalizedBody.includes(normalizeValidationText(candidate))
  );
}

function getRedirectSuspicion(params: {
  operation: TestOperation;
  finalUrl: URL;
  loginUrl: URL | null;
}): { redirectSuspected: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const expectedUrl = new URL(params.operation.url);
  const expectedR = expectedUrl.searchParams.get("R");
  const finalR = params.finalUrl.searchParams.get("R");

  if (expectedR !== null && finalR !== expectedR) {
    reasons.push(`A URL final terminou em R=${finalR ?? "?"} em vez de R=${expectedR}.`);
  }

  if (
    params.loginUrl &&
    params.operation.name !== "Página de Login" &&
    params.finalUrl.searchParams.get("MF") === "Y"
  ) {
    reasons.push("A operação terminou de volta na página de login (?MF=Y).");
  }

  return {
    redirectSuspected: reasons.length > 0,
    reasons,
  };
}

function buildOperationResultBase(
  operation: TestOperation,
  requestedUrl: string,
): OperationValidationResult {
  return {
    name: operation.name,
    method: operation.method,
    requestedUrl,
    finalUrl: requestedUrl,
    statusCode: 0,
    cookieCount: 0,
    redirectCount: 0,
    redirectSuspected: false,
    extractedValues: {},
    technicalStatus: "fail",
    functionalStatus: "fail",
    technicalReasons: [],
    functionalReasons: [],
    loginLikeContentDetected: false,
    expectedTextMatches: [],
    bodySnippet: "",
  };
}

export async function runMistertValidation(
  config: TestConfig,
  envVars: Record<string, string>,
  opts?: {
    timeoutMs?: number;
  },
): Promise<MistertValidationResult> {
  const startedAt = new Date().toISOString();
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const { config: resolvedConfig, missingKeys } = resolveConfigEnvPlaceholders(
    config,
    envVars,
  );
  const operations = createSingleOperationConfig(resolvedConfig);

  for (const operation of operations) {
    await validateTargetHost(new URL(operation.url).hostname);
  }

  const cookieJar = new CookieJar();
  const extractedVars = new Map<string, string>();
  const loginUrl = operations.length > 0 ? new URL(operations[0].url) : null;
  const results: OperationValidationResult[] = [];

  for (const operation of operations) {
    const resolvedUrl = resolveExtractVars(operation.url, extractedVars);
    const resolvedBody = operation.body
      ? resolveExtractVars(operation.body, extractedVars)
      : undefined;
    const resolvedHeaders = resolveExtractHeaders(operation.headers, extractedVars);

    const result = buildOperationResultBase(operation, resolvedUrl);

    if (missingKeys.length > 0) {
      result.technicalReasons.push(
        `Credenciais ausentes no .env: ${missingKeys.join(", ")}.`,
      );
      result.functionalReasons.push(
        "A operação não pôde ser validada funcionalmente porque as credenciais obrigatórias estão ausentes.",
      );
      result.bodySnippet = "Credenciais ausentes.";
      results.push(result);
      continue;
    }

    if (
      hasUnresolvedPlaceholders(resolvedUrl) ||
      hasUnresolvedPlaceholders(resolvedBody) ||
      Object.values(resolvedHeaders ?? {}).some(hasUnresolvedPlaceholders)
    ) {
      result.technicalReasons.push(
        "A operação ainda contém placeholders não resolvidos antes da requisição.",
      );
      result.functionalReasons.push(
        "Sem resposta funcional porque a URL, body ou headers não puderam ser resolvidos.",
      );
      result.bodySnippet = "Placeholders não resolvidos.";
      results.push(result);
      continue;
    }

    try {
      const response = await makeRequest({
        url: new URL(resolvedUrl),
        method: operation.method,
        headers: resolvedHeaders,
        body: resolvedBody,
        cookieJar,
        timeoutMs,
      });

      result.statusCode = response.statusCode;
      result.finalUrl = response.finalUrl.toString();
      result.redirectCount = response.redirectCount;
      result.cookieCount = cookieJar.size;
      result.bodySnippet = buildValidationSnippet(response.bodyText);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        result.technicalReasons.push(
          `Status HTTP final inesperado: ${response.statusCode}.`,
        );
      }

      const redirectCheck = getRedirectSuspicion({
        operation,
        finalUrl: response.finalUrl,
        loginUrl,
      });
      result.redirectSuspected = redirectCheck.redirectSuspected;
      result.technicalReasons.push(...redirectCheck.reasons);

      if (operation.extract) {
        for (const [varName, pattern] of Object.entries(operation.extract)) {
          try {
            const regex = new RegExp(pattern);
            const match = regex.exec(response.bodyText);
            if (match?.[1]) {
              extractedVars.set(varName, match[1]);
              result.extractedValues[varName] = match[1];
            } else {
              result.technicalReasons.push(
                `Não foi possível extrair ${varName} da resposta.`,
              );
            }
          } catch {
            result.technicalReasons.push(
              `Regex inválida ao extrair ${varName}.`,
            );
          }
        }
      }

      const normalizedBody = normalizeValidationText(response.bodyText);
      const rejectLoginLikeContent =
        operation.validation?.rejectLoginLikeContent ??
        operation.name !== "Página de Login";
      const loginLikeContentDetected = detectLoginLikeContent(response.bodyText);
      result.loginLikeContentDetected = loginLikeContentDetected;

      if (rejectLoginLikeContent && loginLikeContentDetected) {
        result.functionalReasons.push(
          "A resposta parece a tela de login do MisterT, não a aba esperada.",
        );
      }

      const expectedTextMatches = getExpectedTextMatches(normalizedBody, operation);
      result.expectedTextMatches = expectedTextMatches;

      if (
        operation.validation?.expectedAnyText &&
        operation.validation.expectedAnyText.length > 0 &&
        expectedTextMatches.length === 0
      ) {
        result.functionalReasons.push(
          `Nenhum texto esperado foi encontrado: ${operation.validation.expectedAnyText.join(", ")}.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.technicalReasons.push(`Falha de rede: ${message}`);
      result.functionalReasons.push(
        "A validação funcional não pôde ser concluída porque a requisição falhou.",
      );
      result.bodySnippet = message;
    }

    result.technicalStatus =
      result.technicalReasons.length === 0 ? "pass" : "fail";
    result.functionalStatus =
      result.functionalReasons.length === 0 ? "pass" : "fail";

    results.push(result);
  }

  const technicalPassed = results.filter(
    (result) => result.technicalStatus === "pass",
  ).length;
  const functionalPassed = results.filter(
    (result) => result.functionalStatus === "pass",
  ).length;
  const overallTechnical: ValidationDimensionStatus =
    technicalPassed === results.length ? "pass" : "fail";
  const overallFunctional: ValidationDimensionStatus =
    functionalPassed === results.length ? "pass" : "fail";

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    overallTechnical,
    overallFunctional,
    canRunStressTest:
      overallTechnical === "pass" && overallFunctional === "pass",
    missingEnvKeys: missingKeys,
    operations: results,
    summary: {
      totalOperations: results.length,
      technicalPassed,
      functionalPassed,
      failedOperations: results
        .filter(
          (result) =>
            result.technicalStatus === "fail" ||
            result.functionalStatus === "fail",
        )
        .map((result) => result.name),
    },
  };
}
