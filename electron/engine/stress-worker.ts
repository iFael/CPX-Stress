/**
 * CPX-Stress — Worker Thread para execução paralela de VUs.
 *
 * Este arquivo roda em threads separadas do Node.js (worker_threads),
 * permitindo distribuir usuários virtuais (VUs) entre múltiplos cores da CPU.
 *
 * Cada worker:
 *   - Recebe uma fatia dos VUs totais via workerData
 *   - Executa requisições HTTP de forma independente
 *   - Envia lotes de resultados ao thread principal a cada 100ms
 *   - Respeita cancelamento via mensagem do thread principal
 *
 * O thread principal (StressEngine) agrega os resultados de todos os workers
 * usando os mesmos callbacks de métricas do modo single-threaded.
 */

import { parentPort, workerData } from "node:worker_threads";
import http from "node:http";
import https from "node:https";
import { setMaxListeners } from "node:events";
import { CookieJar } from "./cookie-jar";
import type { FlowSelectionMode } from "../../src/shared/benchmark-comparison";

if (!parentPort) {
  throw new Error(
    "Este arquivo deve ser executado como worker thread (worker_threads).",
  );
}

// ---------------------------------------------------------------------------
// Tipos e configuração recebida do thread principal
// ---------------------------------------------------------------------------

interface WorkerOperation {
  name: string;
  moduleGroup?: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  captureSession?: boolean;
  extract?: Record<string, string>;
  rejectOnAnyText?: string[];
}

interface WorkerConfig {
  vuCount: number;
  startVuIndex: number;
  operations: WorkerOperation[];
  endTime: number;
  rampUpDelays: number[];
  testId: string;
  maxSockets: number;
  flowSelectionMode?: FlowSelectionMode;
}

interface ResponseSample {
  statusCode: number;
  headers: Record<string, string>;
  cookies: string[];
  bodySnippet: string;
  timestamp: number;
}

interface ResponseItem {
  vuId: number;
  latency: number;
  statusCode: number;
  bytes: number;
  opName: string;
  targetLabel: string;
  method: string;
  captureSession: boolean;
  sample?: ResponseSample;
  sessionInvalid?: boolean;
}

interface NetworkError {
  vuId: number;
  message: string;
  opName: string;
  targetLabel: string;
  method: string;
}

type WorkerVuActivityState =
  | "requesting"
  | "success"
  | "error"
  | "reauthenticating";

interface WorkerActivityEvent {
  vuId: number;
  state: WorkerVuActivityState;
  operationName: string;
  targetLabel: string;
  method: string;
  statusCode?: number;
  latencyMs?: number;
  updatedAt: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// Estado do worker
// ---------------------------------------------------------------------------

const config = workerData as WorkerConfig;
const port = parentPort;
const abortController = new AbortController();
const signal = abortController.signal;
setMaxListeners(0, signal);

// Responder a mensagem de cancelamento do thread principal
port.on("message", (msg: { type: string }) => {
  if (msg.type === "cancel") {
    abortController.abort();
  }
});

// HTTP Agents exclusivos deste worker
const agents = {
  http: new http.Agent({
    keepAlive: true,
    maxSockets: config.maxSockets,
    timeout: 30000,
  }),
  https: new https.Agent({
    keepAlive: true,
    maxSockets: config.maxSockets,
    timeout: 30000,
  }),
};

// Buffers de lote — enviados ao thread principal periodicamente
let responseBatch: ResponseItem[] = [];
let errorBatch: NetworkError[] = [];
const liveVuStates = new Map<number, WorkerActivityEvent>();
let requestCount = 0;

// Enviar lotes a cada 100ms para não sobrecarregar o IPC
const BATCH_INTERVAL_MS = 100;
const batchTimer = setInterval(() => {
  if (responseBatch.length > 0 || errorBatch.length > 0) {
    port.postMessage({
      type: "batch",
      responses: responseBatch,
      networkErrors: errorBatch,
    });
    responseBatch = [];
    errorBatch = [];
  }
}, BATCH_INTERVAL_MS);

const ACTIVITY_SNAPSHOT_INTERVAL_MS = 1000;
const activitySnapshotTimer = setInterval(() => {
  if (liveVuStates.size === 0) return;
  port.postMessage({
    type: "activitySnapshot",
    activityEvents: [...liveVuStates.values()],
  });
}, ACTIVITY_SNAPSHOT_INTERVAL_MS);

function setVuActivity(event: WorkerActivityEvent): void {
  liveVuStates.set(event.vuId, event);
}

function sanitizeTargetLabel(url: URL): string {
  const params = new URLSearchParams(url.search);
  const kept = new URLSearchParams();
  const visibleKeys = new Set(["R", "MF", "Op", "op"]);
  const sensitiveKeyPattern = /(ctrl|token|pass|senha|secret|session|cookie|auth|key)/i;

  for (const [key, value] of params.entries()) {
    if (visibleKeys.has(key)) {
      kept.set(key, value);
      continue;
    }
    if (sensitiveKeyPattern.test(key)) {
      kept.set(key, "***");
      continue;
    }
    if (kept.size < 4 && value.length <= 32 && /^[\w.\-:/]+$/i.test(value)) {
      kept.set(key, value);
    }
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  const query = kept.toString();
  return query ? `${normalizedPath}?${query}` : normalizedPath;
}

// ---------------------------------------------------------------------------
// Execução de requisições HTTP
// ---------------------------------------------------------------------------

function makeSingleRequest(
  opts: {
    url: URL;
    isHttps: boolean;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    cookieJar: CookieJar;
    captureSession: boolean;
    collectBody: boolean;
  },
  captureSample: boolean,
): Promise<{ statusCode: number; bytes: number; sample?: ResponseSample; bodyText?: string; locationHeader?: string }> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Cancelled"));
      return;
    }

    const mod = opts.isHttps ? https : http;
    const mergedHeaders: Record<string, string> = {
      "User-Agent": "CPX-Stress/1.0",
      Accept: "*/*",
      ...opts.headers,
    };

    const cookieHeader = opts.cookieJar.toCookieHeader(opts.url);
    if (cookieHeader) {
      mergedHeaders["Cookie"] = cookieHeader;
    }

    const reqOptions: http.RequestOptions = {
      hostname: opts.url.hostname,
      port: opts.url.port || (opts.isHttps ? 443 : 80),
      path: opts.url.pathname + opts.url.search,
      method: opts.method || "GET",
      agent: opts.isHttps ? agents.https : agents.http,
      headers: mergedHeaders,
      timeout: 30000,
    };

    if (opts.body && opts.method !== "GET") {
      const existingContentType = Object.keys(mergedHeaders).find(
        (k) => k.toLowerCase() === "content-type",
      );
      reqOptions.headers = {
        ...reqOptions.headers,
        ...(existingContentType
          ? {}
          : { "Content-Type": "application/json" }),
        "Content-Length": Buffer.byteLength(opts.body).toString(),
      };
    }

    let settled = false;
    const cleanup = () => {
      settled = true;
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      if (!settled) {
        cleanup();
        req.destroy();
        reject(new Error("Cancelled"));
      }
    };
    signal.addEventListener("abort", onAbort);

    const req = mod.request(reqOptions, (res) => {
      let bytes = 0;
      const bodyChunks: Buffer[] = [];
      let bodyCollected = 0;
      const BODY_LIMIT = 2048;

      // Buffer separado para extraction (até 64KB)
      const extractChunks: Buffer[] = [];
      let extractCollected = 0;
      const EXTRACT_LIMIT = 65536;
      const needExtractBody = opts.collectBody;

      const setCookieHeaders = res.headers["set-cookie"];
      if (opts.captureSession && setCookieHeaders) {
        opts.cookieJar.addFromSetCookieHeaders(setCookieHeaders);
      }

      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (captureSample && bodyCollected < BODY_LIMIT) {
          const remaining = BODY_LIMIT - bodyCollected;
          bodyChunks.push(chunk.subarray(0, remaining));
          bodyCollected += Math.min(chunk.length, remaining);
        }
        if (needExtractBody && extractCollected < EXTRACT_LIMIT) {
          const remaining = EXTRACT_LIMIT - extractCollected;
          extractChunks.push(chunk.subarray(0, remaining));
          extractCollected += Math.min(chunk.length, remaining);
        }
      });

      res.on("end", () => {
        cleanup();
        let sample: ResponseSample | undefined;
        if (captureSample) {
          const headers: Record<string, string> = {};
          for (const [key, val] of Object.entries(res.headers)) {
            if (val) {
              headers[key.toLowerCase()] = Array.isArray(val)
                ? val.join(", ")
                : val;
            }
          }
          sample = {
            statusCode: res.statusCode ?? 0,
            headers,
            cookies: setCookieHeaders
              ? setCookieHeaders.map((c) => c.split(";")[0])
              : [],
            bodySnippet:
              bodyChunks.length > 0
                ? Buffer.concat(bodyChunks)
                    .toString("utf-8")
                    .substring(0, BODY_LIMIT)
                : "",
            timestamp: Date.now(),
          };
        }
        const bodyText = needExtractBody && extractChunks.length > 0
          ? Buffer.concat(extractChunks).toString("utf-8")
          : undefined;
        const locationHeader = typeof res.headers['location'] === 'string'
          ? res.headers['location']
          : undefined;
        resolve({ statusCode: res.statusCode ?? 0, bytes, sample, bodyText, locationHeader });
      });

      res.on("error", (err) => {
        cleanup();
        reject(err);
      });
    });

    req.on("error", (err) => {
      cleanup();
      reject(err);
    });
    req.on("timeout", () => {
      cleanup();
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (opts.body && opts.method !== "GET") {
      req.write(opts.body);
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Redirect following — wrapper que segue até 5 redirects 3xx
// ---------------------------------------------------------------------------

function isRedirectStatus(statusCode: number): boolean {
  return statusCode >= 300 && statusCode <= 308 && statusCode !== 304;
}

async function makeRequest(
  opts: {
    url: URL;
    isHttps: boolean;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    cookieJar: CookieJar;
    captureSession: boolean;
    collectBody: boolean;
  },
  captureSample: boolean,
): Promise<{
  statusCode: number;
  bytes: number;
  sample?: ResponseSample;
  bodyText?: string;
  finalUrl: URL;
}> {
  const MAX_REDIRECT_HOPS = 5;
  let currentUrl = opts.url;
  let currentIsHttps = opts.isHttps;
  let currentMethod = opts.method;
  let currentBody = opts.body;

  let lastResult: Awaited<ReturnType<typeof makeSingleRequest>> | null = null;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const isLastHop = hop === MAX_REDIRECT_HOPS;
    lastResult = await makeSingleRequest(
      {
        ...opts,
        url: currentUrl,
        isHttps: currentIsHttps,
        method: currentMethod,
        body: currentBody,
        // Coletar body em todos os hops — corpo de redirects é tipicamente vazio
        collectBody: opts.collectBody,
      },
      captureSample,
    );

    const { statusCode, locationHeader } = lastResult;
    const isRedirect = isRedirectStatus(statusCode);

    if (!isRedirect || !locationHeader || isLastHop) {
      break;
    }

    // Resolver URL relativa ou absoluta contra a URL atual
    const redirectUrl = new URL(locationHeader, currentUrl.toString());

    // RFC 7231: 302 e 303 sempre mudam para GET e descartam o body
    if (statusCode === 302 || statusCode === 303) {
      currentMethod = 'GET';
      currentBody = undefined;
    }
    // 307 e 308: preservar método e body originais

    currentUrl = redirectUrl;
    currentIsHttps = redirectUrl.protocol === 'https:';
  }

  return {
    statusCode: lastResult!.statusCode,
    bytes: lastResult!.bytes,
    sample: lastResult!.sample,
    bodyText: lastResult!.bodyText,
    finalUrl: currentUrl,
  };
}

// ---------------------------------------------------------------------------
// Response Extraction — substituição de placeholders {{VAR}}
// ---------------------------------------------------------------------------

function resolveExtractVars(
  text: string,
  vars: Map<string, string>,
): string {
  if (vars.size === 0 || !text.includes("{{")) return text;
  return text.replace(/\{\{([^}]+)\}\}/g, (match, varName: string) => {
    return vars.get(varName) ?? match;
  });
}

function resolveExtractHeaders(
  headers: Record<string, string>,
  vars: Map<string, string>,
): Record<string, string> {
  if (vars.size === 0) return headers;
  const resolved: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    resolved[key] = resolveExtractVars(val, vars);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Execução de um Virtual User (VU)
// ---------------------------------------------------------------------------

async function runVU(delay: number, vuId: number): Promise<void> {
  if (delay > 0) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delay);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  const cookieJar = new CookieJar();
  const extractedVars = new Map<string, string>();

  // Helper: executa uma única operação (reutilizado nos modos sequencial e aleatório)
  const executeOp = async (op: WorkerOperation): Promise<{ finalUrl?: URL; sessionInvalid: boolean }> => {
    if (Date.now() >= config.endTime || signal.aborted) return { finalUrl: undefined, sessionInvalid: false };

    // Resolver placeholders {{VAR}} com valores extraídos
    const resolvedUrl = resolveExtractVars(op.url, extractedVars);
    const resolvedBody = op.body
      ? resolveExtractVars(op.body, extractedVars)
      : undefined;
    const resolvedHeaders = op.headers
      ? resolveExtractHeaders(op.headers, extractedVars)
      : undefined;

    const opUrl = new URL(resolvedUrl);
    const isHttps = opUrl.protocol === "https:";
    const start = performance.now();
    const hasExtract = op.extract && Object.keys(op.extract).length > 0;
    const hasRejectTexts = !!op.rejectOnAnyText?.length;
    requestCount++;
    const captureSample = requestCount % 50 === 1;

    const targetLabel = sanitizeTargetLabel(opUrl);
    setVuActivity({
      vuId,
      state: "requesting",
      operationName: op.name,
      targetLabel,
      method: op.method,
      updatedAt: Date.now(),
      message: "Requisição em andamento.",
    });

    try {
      const result = await makeRequest(
        {
          url: opUrl,
          isHttps,
          method: op.method,
          headers: resolvedHeaders,
          body: resolvedBody,
          cookieJar,
          captureSession: op.captureSession !== false,
          collectBody: hasExtract || hasRejectTexts,
        },
        captureSample,
      );

      // Aplicar response extraction
      if (hasExtract && result.bodyText) {
        for (const [varName, pattern] of Object.entries(op.extract!)) {
          try {
            const regex = new RegExp(pattern);
            const match = regex.exec(result.bodyText);
            if (match && match[1]) {
              extractedVars.set(varName, match[1]);
            }
          } catch {
            // Regex inválida — ignorar
          }
        }
      }

      // Detectar página de erro de sessão via conteúdo (ex: "Este erro nunca deve ocorrer")
      let sessionInvalid = false;
      if (hasRejectTexts && result.bodyText) {
        for (const text of op.rejectOnAnyText!) {
          if (result.bodyText.includes(text)) {
            sessionInvalid = true;
            break;
          }
        }
      }

      responseBatch.push({
        vuId,
        latency: performance.now() - start,
        statusCode: result.statusCode,
        bytes: result.bytes,
        opName: op.name,
        targetLabel,
        method: op.method,
        captureSession: op.captureSession !== false,
        sample: result.sample,
        sessionInvalid,
      });
      setVuActivity({
        vuId,
        state: result.statusCode >= 400 ? "error" : "success",
        operationName: op.name,
        targetLabel,
        method: op.method,
        statusCode: result.statusCode,
        latencyMs: Math.round((performance.now() - start) * 100) / 100,
        updatedAt: Date.now(),
        message:
          result.statusCode >= 400
            ? `Resposta HTTP ${result.statusCode}.`
            : "Resposta concluída com sucesso.",
      });
      return { finalUrl: result.finalUrl, sessionInvalid };
    } catch (err) {
      if (!signal.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        errorBatch.push({
          vuId,
          message: msg,
          opName: op.name,
          targetLabel,
          method: op.method,
        });
        setVuActivity({
          vuId,
          state: "error",
          operationName: op.name,
          targetLabel,
          method: op.method,
          updatedAt: Date.now(),
          message: msg,
        });
      }
      return { finalUrl: undefined, sessionInvalid: false };
    }
  };

  const firstModuleIndex = config.operations.findIndex(
    (operation) =>
      typeof operation.moduleGroup === "string" &&
      operation.moduleGroup.trim() !== "",
  );
  const authOps =
    firstModuleIndex >= 0
      ? config.operations.slice(0, firstModuleIndex)
      : config.operations;
  const moduleOps =
    firstModuleIndex >= 0 ? config.operations.slice(firstModuleIndex) : [];
  const moduleFlows: WorkerOperation[][] = [];

  for (const operation of moduleOps) {
    const groupName = operation.moduleGroup || operation.name;
    const currentFlow = moduleFlows[moduleFlows.length - 1];
    const currentGroupName =
      currentFlow && currentFlow.length > 0
        ? currentFlow[0].moduleGroup || currentFlow[0].name
        : null;

    if (currentFlow && currentGroupName === groupName) {
      currentFlow.push(operation);
    } else {
      moduleFlows.push([operation]);
    }
  }

  // Fase de autenticação inicial — executa UMA VEZ por VU
  for (const op of authOps) {
    await executeOp(op);
  }

  // Determinar pathname da página de login para detecção de expiração de sessão
  const loginUrl = authOps.length > 0 ? new URL(authOps[0].url) : null;
  let nextFlowIndex = 0;

  const selectModuleFlow = (): WorkerOperation[] | null => {
    if (moduleFlows.length === 0) {
      return null;
    }

    if (config.flowSelectionMode === "deterministic") {
      const selectedFlow = moduleFlows[nextFlowIndex % moduleFlows.length];
      nextFlowIndex += 1;
      return selectedFlow;
    }

    return moduleFlows[Math.floor(Math.random() * moduleFlows.length)];
  };

  // Loop principal — apenas operações de módulo
  while (Date.now() < config.endTime && !signal.aborted) {
    if (moduleFlows.length === 0) {
      // Modo single-op ou auth-only: mantém comportamento original
      for (const op of authOps) {
        await executeOp(op);
      }
      continue;
    }

    const selectedFlow = selectModuleFlow();
    if (!selectedFlow) {
      continue;
    }
    let sessionExpired = false;

    for (const operation of selectedFlow) {
      const opResult = await executeOp(operation);
      const finalUrl = opResult.finalUrl;

      sessionExpired =
        opResult.sessionInvalid ||
        (loginUrl !== null &&
         finalUrl !== undefined &&
         finalUrl.pathname.toLowerCase() === loginUrl.pathname.toLowerCase() &&
         finalUrl.searchParams.toString() === loginUrl.searchParams.toString());

      if (sessionExpired) {
        break;
      }
    }

    if (sessionExpired) {
      setVuActivity({
        vuId,
        state: "reauthenticating",
        operationName: "Reautenticando sessão",
        targetLabel: "Fluxo de login",
        method: "POST",
        updatedAt: Date.now(),
        message: "Sessão expirada; refazendo autenticação.",
      });
      cookieJar.clear();
      extractedVars.clear();
      for (const op of authOps) {
        await executeOp(op);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Ponto de entrada — spawna todos os VUs deste worker
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const vuPromises: Promise<void>[] = [];

  for (let i = 0; i < config.vuCount; i++) {
    vuPromises.push(runVU(config.rampUpDelays[i] || 0, config.startVuIndex + i + 1));
  }

  try {
    await Promise.all(vuPromises);
  } catch {
    // Esperado ao cancelar
  }

  clearInterval(batchTimer);
  clearInterval(activitySnapshotTimer);

  // Flush final — envia dados restantes no buffer
  if (responseBatch.length > 0 || errorBatch.length > 0) {
    port.postMessage({
      type: "batch",
      responses: responseBatch,
      networkErrors: errorBatch,
    });
    responseBatch = [];
    errorBatch = [];
  }

  if (liveVuStates.size > 0) {
    port.postMessage({
      type: "activitySnapshot",
      activityEvents: [...liveVuStates.values()],
    });
  }

  // Limpar recursos
  agents.http.destroy();
  agents.https.destroy();

  port.postMessage({ type: "done" });
}

main();
