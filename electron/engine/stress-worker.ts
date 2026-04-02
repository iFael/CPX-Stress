/**
 * StressFlow — Worker Thread para execução paralela de VUs.
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
import { CookieJar } from "./cookie-jar";

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
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  captureSession?: boolean;
  extract?: Record<string, string>;
}

interface WorkerConfig {
  vuCount: number;
  operations: WorkerOperation[];
  endTime: number;
  rampUpDelays: number[];
  testId: string;
  maxSockets: number;
}

interface ResponseSample {
  statusCode: number;
  headers: Record<string, string>;
  cookies: string[];
  bodySnippet: string;
  timestamp: number;
}

interface ResponseItem {
  latency: number;
  statusCode: number;
  bytes: number;
  opName: string;
  captureSession: boolean;
  sample?: ResponseSample;
}

interface NetworkError {
  message: string;
  opName: string;
}

// ---------------------------------------------------------------------------
// Estado do worker
// ---------------------------------------------------------------------------

const config = workerData as WorkerConfig;
const port = parentPort;
const abortController = new AbortController();
const signal = abortController.signal;

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

// ---------------------------------------------------------------------------
// Execução de requisições HTTP
// ---------------------------------------------------------------------------

function makeRequest(
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
): Promise<{ statusCode: number; bytes: number; sample?: ResponseSample; bodyText?: string }> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Cancelled"));
      return;
    }

    const mod = opts.isHttps ? https : http;
    const mergedHeaders: Record<string, string> = {
      "User-Agent": "StressFlow/1.0",
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

      // Buffer separado para extraction (até 16KB)
      const extractChunks: Buffer[] = [];
      let extractCollected = 0;
      const EXTRACT_LIMIT = 16384;
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
        resolve({ statusCode: res.statusCode ?? 0, bytes, sample, bodyText });
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

async function runVU(delay: number): Promise<void> {
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
  const executeOp = async (op: WorkerOperation): Promise<void> => {
    if (Date.now() >= config.endTime || signal.aborted) return;

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

    requestCount++;
    const captureSample = requestCount % 50 === 1;

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
          collectBody: !!hasExtract,
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

      responseBatch.push({
        latency: performance.now() - start,
        statusCode: result.statusCode,
        bytes: result.bytes,
        opName: op.name,
        captureSession: op.captureSession !== false,
        sample: result.sample,
      });
    } catch (err) {
      if (!signal.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        errorBatch.push({ message: msg, opName: op.name });
      }
    }
  };

  // Separar operações em: cadeia de autenticação (sequencial) e módulos (aleatório).
  // A cadeia de autenticação inclui tudo até o primeiro GET após o último POST/PUT,
  // garantindo que login e estabelecimento de sessão ocorram em ordem.
  // Os módulos restantes são acessados aleatoriamente, assegurando cobertura
  // uniforme mesmo com tempos de execução curtos.
  let lastMutationIndex = -1;
  for (let i = 0; i < config.operations.length; i++) {
    if (config.operations[i].method !== "GET") lastMutationIndex = i;
  }
  const authBoundary =
    lastMutationIndex >= 0
      ? Math.min(lastMutationIndex + 2, config.operations.length)
      : 0;
  const authOps = config.operations.slice(0, authBoundary);
  const moduleOps = config.operations.slice(authBoundary);

  while (Date.now() < config.endTime && !signal.aborted) {
    // Fase 1: Executar cadeia de autenticação sequencialmente
    for (const op of authOps) {
      await executeOp(op);
    }

    if (moduleOps.length === 0) {
      // Sem módulos — apenas loop de autenticação
      continue;
    }

    // Fase 2: Selecionar módulo aleatório do pool de operações pós-autenticação
    const randomModule =
      moduleOps[Math.floor(Math.random() * moduleOps.length)];
    await executeOp(randomModule);
  }
}

// ---------------------------------------------------------------------------
// Ponto de entrada — spawna todos os VUs deste worker
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const vuPromises: Promise<void>[] = [];

  for (let i = 0; i < config.vuCount; i++) {
    vuPromises.push(runVU(config.rampUpDelays[i] || 0));
  }

  try {
    await Promise.all(vuPromises);
  } catch {
    // Esperado ao cancelar
  }

  clearInterval(batchTimer);

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

  // Limpar recursos
  agents.http.destroy();
  agents.https.destroy();

  port.postMessage({ type: "done" });
}

main();
