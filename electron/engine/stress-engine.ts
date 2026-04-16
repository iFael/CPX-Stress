import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import { URL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import { setMaxListeners } from "node:events";
import { Worker } from "node:worker_threads";
import { v4 as uuidv4 } from "uuid";
import { ProtectionDetector } from "./protection-detector";
import type { ResponseSample } from "./protection-detector";
import { CookieJar } from "./cookie-jar";
import type {
  MeasurementReliability,
  MeasurementReliabilitySignals,
} from "../../src/shared/test-analysis";
import type {
  OperationNavigationHints,
  OperationValidationHints,
} from "../../src/shared/mistert-validation";
import {
  detectLoginLikeContent,
  normalizeValidationText,
} from "../../src/shared/mistert-validation";

export interface TestOperation {
  name: string;
  moduleGroup?: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  captureSession?: boolean;
  /**
   * Extração de valores da resposta HTTP para uso em operações seguintes.
   * Chave = nome da variável (ex: "CTRL"), valor = regex com grupo de captura.
   * O primeiro grupo capturado é armazenado. Placeholder {{NOME}} em url/body/headers
   * é substituído pelo valor extraído na operação anterior.
   */
  extract?: Record<string, string>;
  validation?: OperationValidationHints;
  navigation?: OperationNavigationHints;
}

export interface TestConfig {
  url: string;
  virtualUsers: number;
  duration: number;
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  rampUp?: number;
  operations?: TestOperation[];
}

/** Registro detalhado de um erro individual. */
export interface ErrorDetail {
  id: string;
  testId: string;
  timestamp: number;
  operationName: string;
  statusCode: number;
  errorType: "http" | "timeout" | "connection" | "dns" | "unknown";
  message: string;
  responseSnippet?: string;
}

/** Métricas agregadas por operação. */
export interface OperationMetrics {
  name: string;
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  rps: number;
  latency: {
    avg: number;
    min: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    max: number;
  };
  statusCodes: Record<string, number>;
  sessionMetrics?: {
    authenticatedRequests: number;
    sessionFailures: number;
    sessionExpiredErrors: number;
    consistencyScore: number;
  };
}

export interface SecondMetrics {
  timestamp: number;
  second: number;
  requests: number;
  errors: number;
  latencyAvg: number;
  latencyP50: number;
  latencyP90: number;
  latencyP95: number;
  latencyP99: number;
  latencyMax: number;
  latencyMin: number;
  statusCodes: Record<string, number>;
  bytesReceived: number;
  activeUsers: number;
}

export type LiveVuActivityState =
  | "queued"
  | "requesting"
  | "success"
  | "error"
  | "reauthenticating";

export interface LiveVuActivitySnapshot {
  vuId: number;
  state: LiveVuActivityState;
  operationName: string;
  targetLabel: string;
  method: string;
  statusCode?: number;
  latencyMs?: number;
  updatedAt: number;
  message?: string;
}

export interface LiveOperationSummary {
  operationName: string;
  activeVus: number;
  lastSecondRequests: number;
  lastSecondErrors: number;
}

export interface LiveActivityData {
  mode: "per-vu" | "summary";
  totalVus: number;
  vus: LiveVuActivitySnapshot[];
  summary: LiveOperationSummary[];
  fallbackThreshold: number;
}

export interface VuResultSummary {
  vuId: number;
  finalState: LiveVuActivityState;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  outcomeBreakdown: Record<string, number>;
  lastOperationName: string;
  lastTargetLabel: string;
  lastMethod: string;
  lastStatusCode?: number;
  lastLatencyMs?: number;
  lastUpdatedAt: number;
  lastMessage?: string;
}

interface RuntimeErrorSecondMetrics {
  second: number;
  timeoutErrors: number;
  connectionErrors: number;
}

export interface ProgressData {
  currentSecond: number;
  totalSeconds: number;
  metrics: SecondMetrics;
  cumulative: {
    totalRequests: number;
    totalErrors: number;
    rps: number;
  };
  liveActivity: LiveActivityData;
}

export interface TestResult {
  id: string;
  url: string;
  config: TestConfig;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  totalRequests: number;
  totalErrors: number;
  rps: number;
  latency: {
    avg: number;
    min: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    max: number;
  };
  errorRate: number;
  throughputBytesPerSec: number;
  totalBytes: number;
  statusCodes: Record<string, number>;
  timeline: SecondMetrics[];
  status: "completed" | "cancelled" | "error";
  errorMessage?: string;
  protectionReport?: {
    detections: Array<{
      type: string;
      provider: string;
      confidence: number;
      confidenceLevel: string;
      indicators: Array<{
        source: string;
        name: string;
        value: string;
        detail: string;
      }>;
      description: string;
    }>;
    rateLimitInfo: {
      detected: boolean;
      triggerPoint?: number;
      limitPerWindow?: string;
      windowSeconds?: number;
      recoveryPattern?: string;
    };
    behavioralPatterns: Array<{
      type: string;
      description: string;
      startSecond?: number;
      evidence: string;
    }>;
    overallRisk: string;
    summary: string;
    analysisTimestamp: string;
  };
  operationMetrics?: Record<string, OperationMetrics>;
  measurementReliability?: MeasurementReliability;
  operationalWarnings?: string[];
  errorBreakdown?: {
    timeout: number;
    connection: number;
    http: number;
    dns: number;
    unknown: number;
  };
  vuResults?: VuResultSummary[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function hasUnresolvedPlaceholders(value: string | undefined): boolean {
  return !!value && /\{\{[^}]+\}\}/.test(value);
}

function getUnresolvedPlaceholderNames(value: string | undefined): string[] {
  if (!value || !value.includes("{{")) return [];

  const matches = value.matchAll(/\{\{([^}]+)\}\}/g);
  return [...new Set([...matches].map((match) => match[1]).filter(Boolean))];
}

function getExpectedTextMatches(
  bodyText: string,
  validation: OperationValidationHints | undefined,
): string[] {
  const expectedAnyText = validation?.expectedAnyText;
  if (!expectedAnyText || expectedAnyText.length === 0) return [];

  const normalizedBody = normalizeValidationText(bodyText);
  return expectedAnyText.filter((candidate) =>
    normalizedBody.includes(normalizeValidationText(candidate)),
  );
}

// Correção de segurança: lista de ranges de IP privados/reservados para prevenir SSRF.
// Bloqueia requisições a endereços internos da rede, loopback e metadados de cloud providers.
const BLOCKED_IP_RANGES = [
  // Loopback IPv4 e IPv6
  { prefix: "127.", type: "loopback" },
  { prefix: "::1", type: "loopback" },
  { prefix: "0.0.0.0", type: "unspecified" },
  { prefix: "::", type: "unspecified" },
  // Redes privadas (RFC 1918)
  { prefix: "10.", type: "private" },
  { prefix: "192.168.", type: "private" },
  // Link-local
  { prefix: "169.254.", type: "link-local" },
  { prefix: "fe80:", type: "link-local" },
  // Cloud metadata endpoints (SSRF prevention)
  { prefix: "168.63.129.16", type: "cloud-metadata" },
  { prefix: "fd00:", type: "private-ipv6" },
  { prefix: "fc00:", type: "private-ipv6" },
];

// Correção de segurança: verifica se um IP pertence à faixa 172.16.0.0 - 172.31.255.255
function isPrivate172(ip: string): boolean {
  const match = ip.match(/^172\.(\d+)\./);
  if (!match) return false;
  const second = parseInt(match[1], 10);
  return second >= 16 && second <= 31;
}

// Correção de segurança: valida se o IP resolvido não é interno/privado (proteção contra SSRF)
function isBlockedIP(ip: string): boolean {
  for (const range of BLOCKED_IP_RANGES) {
    if (ip.startsWith(range.prefix)) return true;
  }
  if (isPrivate172(ip)) return true;
  return false;
}

// Correção de segurança: resolve o hostname e verifica se aponta para endereço privado/interno
export async function validateTargetHost(hostname: string): Promise<void> {
  // Guard: permite rede interna corporativa quando opt-in explícito via .env
  const allowInternal = process.env.STRESSFLOW_ALLOW_INTERNAL === 'true';
  if (allowInternal) return;

  const normalizedHostname =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

  // Se for um IP literal, verificar diretamente
  if (net.isIP(normalizedHostname)) {
    if (isBlockedIP(normalizedHostname)) {
      throw new Error(
        `Endereço bloqueado: "${hostname}" aponta para uma rede interna ou reservada. ` +
          "Testes de estresse só são permitidos contra servidores externos.",
      );
    }
    return;
  }

  // Resolver DNS e verificar TODOS os IPs resultantes (IPv4 + IPv6)
  // Correção B-1: Resolve ambos IPv4 e IPv6 para evitar bypass via dual-stack
  const resolveIPv4 = (): Promise<string[]> =>
    new Promise((res) => {
      dns.resolve4(normalizedHostname, (err, addrs) => res(err ? [] : addrs));
    });
  const resolveIPv6 = (): Promise<string[]> =>
    new Promise((res) => {
      dns.resolve6(normalizedHostname, (err, addrs) => res(err ? [] : addrs));
    });

  const [ipv4Addrs, ipv6Addrs] = await Promise.all([
    resolveIPv4(),
    resolveIPv6(),
  ]);
  const allAddresses = [...ipv4Addrs, ...ipv6Addrs];

  if (allAddresses.length === 0) {
    throw new Error(
      `Não foi possível resolver o hostname "${hostname}". Verifique se o endereço está correto.`,
    );
  }

  for (const addr of allAddresses) {
    if (isBlockedIP(addr)) {
      throw new Error(
        `Endereço bloqueado: "${hostname}" resolve para ${addr} (rede interna/reservada). ` +
          "Testes de estresse só são permitidos contra servidores externos.",
      );
    }
  }
}

// Correção de segurança: limites máximos para prevenir abuso de recursos
const MAX_VIRTUAL_USERS = 10_000;
const MAX_DURATION_SECONDS = 600;
const MAX_BODY_SIZE = 1_048_576; // 1 MB
const MAX_HEADER_COUNT = 50;
const ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE"] as const;
const BLOCKED_HEADERS = ["host", "transfer-encoding", "connection", "upgrade"];

function validateHttpUrl(rawUrl: string, fieldName: string): URL {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    throw new Error(`${fieldName} é obrigatório`);
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Apenas protocolos HTTP e HTTPS são permitidos");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.includes("protocolos")) {
      throw error;
    }
    throw new Error(`${fieldName} inválido: formato não reconhecido`);
  }
}

function validateBody(
  body: string | undefined | null,
  fieldName: string,
): void {
  if (body === undefined || body === null) return;

  if (typeof body !== "string") {
    throw new Error(`${fieldName} deve ser uma string`);
  }

  if (body.length > MAX_BODY_SIZE) {
    throw new Error(`${fieldName} excede o limite de ${MAX_BODY_SIZE} bytes`);
  }
}

function validateHeaders(
  headers: Record<string, string> | undefined | null,
  fieldName: string,
): void {
  if (headers === undefined || headers === null) return;

  if (typeof headers !== "object") {
    throw new Error(`${fieldName} devem ser um objeto`);
  }

  const headerEntries = Object.entries(headers);
  if (headerEntries.length > MAX_HEADER_COUNT) {
    throw new Error(
      `Número de ${fieldName.toLowerCase()} excede o limite de ${MAX_HEADER_COUNT}`,
    );
  }

  for (const [key, value] of headerEntries) {
    if (typeof key !== "string" || typeof value !== "string") {
      throw new Error(`${fieldName} devem conter apenas strings`);
    }
    if (BLOCKED_HEADERS.includes(key.toLowerCase())) {
      throw new Error(`Header bloqueado por segurança: ${key}`);
    }
  }
}

function validateOperation(operation: TestOperation, index: number): void {
  if (!operation || typeof operation !== "object") {
    throw new Error(`Operação ${index + 1} inválida`);
  }

  if (typeof operation.name !== "string" || operation.name.trim() === "") {
    throw new Error(`Operação ${index + 1} precisa ter um nome`);
  }

  if (
    operation.moduleGroup !== undefined &&
    (typeof operation.moduleGroup !== "string" ||
      operation.moduleGroup.trim() === "")
  ) {
    throw new Error(
      `moduleGroup da operação ${index + 1} deve ser uma string não vazia`,
    );
  }

  validateHttpUrl(operation.url, `URL da operação ${index + 1}`);

  if (!ALLOWED_METHODS.includes(operation.method)) {
    throw new Error(
      `Método HTTP inválido na operação ${index + 1}: ${operation.method}`,
    );
  }

  validateBody(operation.body, `Corpo da operação ${index + 1}`);
  validateHeaders(operation.headers, `Headers da operação ${index + 1}`);

  if (operation.validation !== undefined && operation.validation !== null) {
    if (typeof operation.validation !== "object") {
      throw new Error(
        `validation da operação ${index + 1} deve ser um objeto`,
      );
    }

    const { expectedAnyText, rejectLoginLikeContent } = operation.validation;

    if (
      expectedAnyText !== undefined &&
      (!Array.isArray(expectedAnyText) ||
        expectedAnyText.some(
          (value) => typeof value !== "string" || value.trim() === "",
        ))
    ) {
      throw new Error(
        `validation.expectedAnyText da operação ${index + 1} deve conter apenas strings não vazias`,
      );
    }

    if (
      rejectLoginLikeContent !== undefined &&
      typeof rejectLoginLikeContent !== "boolean"
    ) {
      throw new Error(
        `validation.rejectLoginLikeContent da operação ${index + 1} deve ser boolean`,
      );
    }
  }

  if (operation.navigation !== undefined && operation.navigation !== null) {
    if (typeof operation.navigation !== "object") {
      throw new Error(
        `navigation da operação ${index + 1} deve ser um objeto`,
      );
    }

    const { accessMode, sourceAction, notes } = operation.navigation;

    if (accessMode !== "url-driven" && accessMode !== "action-driven") {
      throw new Error(
        `navigation.accessMode da operação ${index + 1} deve ser "url-driven" ou "action-driven"`,
      );
    }

    if (notes !== undefined && typeof notes !== "string") {
      throw new Error(
        `navigation.notes da operação ${index + 1} deve ser string`,
      );
    }

    if (sourceAction !== undefined && sourceAction !== null) {
      if (typeof sourceAction !== "object") {
        throw new Error(
          `navigation.sourceAction da operação ${index + 1} deve ser um objeto`,
        );
      }

      if (
        sourceAction.kind !== "direct-url" &&
        sourceAction.kind !== "form-submit"
      ) {
        throw new Error(
          `navigation.sourceAction.kind da operação ${index + 1} deve ser "direct-url" ou "form-submit"`,
        );
      }

      if (!ALLOWED_METHODS.includes(sourceAction.method)) {
        throw new Error(
          `navigation.sourceAction.method da operação ${index + 1} é inválido`,
        );
      }

      if (
        sourceAction.submitControlName !== undefined &&
        typeof sourceAction.submitControlName !== "string"
      ) {
        throw new Error(
          `navigation.sourceAction.submitControlName da operação ${index + 1} deve ser string`,
        );
      }

      if (
        sourceAction.submitControlValue !== undefined &&
        typeof sourceAction.submitControlValue !== "string"
      ) {
        throw new Error(
          `navigation.sourceAction.submitControlValue da operação ${index + 1} deve ser string`,
        );
      }

      if (
        sourceAction.description !== undefined &&
        typeof sourceAction.description !== "string"
      ) {
        throw new Error(
          `navigation.sourceAction.description da operação ${index + 1} deve ser string`,
        );
      }

      if (sourceAction.fields !== undefined && sourceAction.fields !== null) {
        validateHeaders(
          sourceAction.fields,
          `navigation.sourceAction.fields da operação ${index + 1}`,
        );
      }
    }
  }
}

// Correção de segurança: valida campos do TestConfig recebido via IPC
export function validateTestConfig(config: TestConfig): void {
  if (!config || typeof config !== "object") {
    throw new Error("Configuração de teste inválida");
  }

  validateHttpUrl(config.url, "URL");

  // Validar virtualUsers (deve ser inteiro)
  if (
    typeof config.virtualUsers !== "number" ||
    !Number.isInteger(config.virtualUsers) ||
    config.virtualUsers < 1 ||
    config.virtualUsers > MAX_VIRTUAL_USERS
  ) {
    throw new Error(
      `Número de usuários virtuais deve ser um inteiro entre 1 e ${MAX_VIRTUAL_USERS}`,
    );
  }

  // Validar duration (deve ser inteiro)
  if (
    typeof config.duration !== "number" ||
    !Number.isInteger(config.duration) ||
    config.duration < 1 ||
    config.duration > MAX_DURATION_SECONDS
  ) {
    throw new Error(
      `Duração deve ser um inteiro entre 1 e ${MAX_DURATION_SECONDS} segundos`,
    );
  }

  // Validar method
  if (!ALLOWED_METHODS.includes(config.method)) {
    throw new Error(`Método HTTP inválido: ${config.method}`);
  }

  validateBody(config.body, "Corpo da requisição");
  validateHeaders(config.headers, "Headers");

  // Validar rampUp
  if (config.rampUp !== undefined && config.rampUp !== null) {
    if (
      typeof config.rampUp !== "number" ||
      !Number.isFinite(config.rampUp) ||
      config.rampUp < 0
    ) {
      throw new Error("Ramp-up deve ser um número positivo");
    }
    if (config.rampUp > config.duration) {
      throw new Error("Ramp-up não pode ser maior que a duração do teste");
    }
  }

  if (config.operations !== undefined && config.operations !== null) {
    if (!Array.isArray(config.operations)) {
      throw new Error("Operações devem ser enviadas em uma lista");
    }
    for (const [index, operation] of config.operations.entries()) {
      validateOperation(operation, index);
    }
  }
}

/**
 * Limiar de VUs para ativar worker threads.
 * Acima deste valor, os VUs são distribuídos entre múltiplos cores da CPU
 * para evitar saturação do event loop principal do Node.js.
 */
const WORKER_THREAD_THRESHOLD = 256;
const LIVE_VU_FALLBACK_THRESHOLD = 500;

export class StressEngine {
  private cancelled = false;
  private durationExpired = false;
  private abortController: AbortController | null = null;
  private activeInterval: ReturnType<typeof setInterval> | null = null;
  private activeAgents: { http: http.Agent | null; https: https.Agent | null } =
    {
      http: null,
      https: null,
    };
  private activeDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private activeWorkers: Worker[] = [];
  private vuRequestCount = 0;
  private runtimeErrorCounts = {
    timeout: 0,
    connection: 0,
    http: 0,
    dns: 0,
    unknown: 0,
  };

  /** Buffer de erros detalhados coletados durante o teste. */
  private errorBuffer: ErrorDetail[] = [];
  private readonly MAX_ERROR_BUFFER = 10_000;

  /** Callback para flush periodico de erros ao banco. */
  private onErrorBatch: ((errors: ErrorDetail[]) => void) | null = null;

  /** Métricas por operação (testes multi-operação). */
  private opMetrics: Map<
    string,
    {
      latencies: number[];
      latencySampleCount: number;
      requests: number;
      errors: number;
      statusCodes: Record<string, number>;
      session: {
        authenticatedRequests: number;
        sessionFailures: number;
        sessionExpiredErrors: number;
      };
    }
  > = new Map();
  private liveVuActivity = new Map<number, LiveVuActivitySnapshot>();
  private vuResultSummaries = new Map<number, VuResultSummary>();
  private secOperationCounts = new Map<
    string,
    { requests: number; errors: number }
  >();

  private createQueuedVuActivity(vuId: number): LiveVuActivitySnapshot {
    return {
      vuId,
      state: "queued",
      operationName: "Aguardando início",
      targetLabel: "Aguardando primeiro acesso",
      method: "—",
      updatedAt: Date.now(),
      message: "VU aguardando ramp-up ou primeira requisição.",
    };
  }

  private initializeLiveVuActivity(totalVus: number): void {
    this.liveVuActivity = new Map();
    this.vuResultSummaries = new Map();
    for (let vuId = 1; vuId <= totalVus; vuId++) {
      this.liveVuActivity.set(vuId, this.createQueuedVuActivity(vuId));
      this.vuResultSummaries.set(vuId, {
        vuId,
        finalState: "queued",
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        outcomeBreakdown: {},
        lastOperationName: "Aguardando início",
        lastTargetLabel: "Aguardando primeiro acesso",
        lastMethod: "—",
        lastUpdatedAt: Date.now(),
        lastMessage: "VU aguardando ramp-up ou primeira requisição.",
      });
    }
  }

  private updateVuActivity(
    vuId: number,
    data: Omit<LiveVuActivitySnapshot, "vuId" | "updatedAt"> & {
      updatedAt?: number;
    },
  ): void {
    const existing =
      this.liveVuActivity.get(vuId) ?? this.createQueuedVuActivity(vuId);
    this.liveVuActivity.set(vuId, {
      ...existing,
      ...data,
      vuId,
      updatedAt: data.updatedAt ?? Date.now(),
    });
  }

  private updateVuResultSummary(
    vuId: number,
    data: Partial<VuResultSummary> & {
      outcomeKey?: string;
      incrementTotalRequests?: boolean;
      incrementSuccess?: boolean;
      incrementFailure?: boolean;
    },
  ): void {
    const existing =
      this.vuResultSummaries.get(vuId) ?? {
        vuId,
        finalState: "queued" as LiveVuActivityState,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        outcomeBreakdown: {},
        lastOperationName: "Aguardando início",
        lastTargetLabel: "Aguardando primeiro acesso",
        lastMethod: "—",
        lastUpdatedAt: Date.now(),
        lastMessage: "VU aguardando ramp-up ou primeira requisição.",
      };

    const outcomeBreakdown = { ...existing.outcomeBreakdown };
    if (data.outcomeKey) {
      outcomeBreakdown[data.outcomeKey] =
        (outcomeBreakdown[data.outcomeKey] || 0) + 1;
    }

    this.vuResultSummaries.set(vuId, {
      ...existing,
      ...data,
      outcomeBreakdown,
      totalRequests:
        existing.totalRequests + (data.incrementTotalRequests ? 1 : 0),
      successfulRequests:
        existing.successfulRequests + (data.incrementSuccess ? 1 : 0),
      failedRequests: existing.failedRequests + (data.incrementFailure ? 1 : 0),
      lastUpdatedAt: data.lastUpdatedAt ?? Date.now(),
    });
  }

  private noteOperationSecondCount(
    operationName: string,
    kind: "request" | "error",
  ): void {
    const current = this.secOperationCounts.get(operationName) ?? {
      requests: 0,
      errors: 0,
    };
    if (kind === "request") current.requests++;
    else current.errors++;
    this.secOperationCounts.set(operationName, current);
  }

  private sanitizeTargetLabel(url: URL): string {
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
      if (
        kept.size < 4 &&
        value.length <= 32 &&
        /^[\w.\-:/]+$/i.test(value)
      ) {
        kept.set(key, value);
      }
    }

    const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
    const query = kept.toString();
    return query ? `${normalizedPath}?${query}` : normalizedPath;
  }

  private buildLiveOperationSummary(): LiveOperationSummary[] {
    const activeByOperation = new Map<string, number>();

    for (const activity of this.liveVuActivity.values()) {
      if (
        activity.state === "queued" ||
        !activity.operationName ||
        activity.operationName === "Aguardando início"
      ) {
        continue;
      }
      activeByOperation.set(
        activity.operationName,
        (activeByOperation.get(activity.operationName) || 0) + 1,
      );
    }

    const operationNames = new Set<string>([
      ...this.opMetrics.keys(),
      ...activeByOperation.keys(),
      ...this.secOperationCounts.keys(),
    ]);

    return [...operationNames]
      .map((operationName) => {
        const secondCounts = this.secOperationCounts.get(operationName) ?? {
          requests: 0,
          errors: 0,
        };
        return {
          operationName,
          activeVus: activeByOperation.get(operationName) || 0,
          lastSecondRequests: secondCounts.requests,
          lastSecondErrors: secondCounts.errors,
        };
      })
      .sort((a, b) => {
        if (b.activeVus !== a.activeVus) return b.activeVus - a.activeVus;
        if (b.lastSecondRequests !== a.lastSecondRequests) {
          return b.lastSecondRequests - a.lastSecondRequests;
        }
        return a.operationName.localeCompare(b.operationName, "pt-BR");
      });
  }

  private buildLiveActivity(totalVus: number): LiveActivityData {
    const summary = this.buildLiveOperationSummary();
    const mode =
      totalVus > LIVE_VU_FALLBACK_THRESHOLD ? "summary" : "per-vu";
    const vus =
      mode === "per-vu"
        ? [...this.liveVuActivity.values()].sort((a, b) => a.vuId - b.vuId)
        : [];

    return {
      mode,
      totalVus,
      vus,
      summary,
      fallbackThreshold: LIVE_VU_FALLBACK_THRESHOLD,
    };
  }

  private preflight(
    url: URL,
    isHttps: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error("Cancelado"));
        return;
      }

      const mod = isHttps ? https : http;
      const req = mod.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: "HEAD",
          timeout: 10000,
        },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on("error", (err: Error) =>
        reject(
          new Error(
            `Não foi possível conectar ao servidor "${url.hostname}": ${err.message}`,
          ),
        ),
      );
      req.on("timeout", () => {
        req.destroy();
        reject(
          new Error(
            `O servidor "${url.hostname}" não respondeu dentro de 10 segundos`,
          ),
        );
      });

      const cleanup = () => {
        signal.removeEventListener("abort", abortHandler);
      };
      const abortHandler = () => {
        cleanup();
        req.destroy();
        reject(new Error("Cancelado"));
      };
      signal.addEventListener("abort", abortHandler, { once: true });
      req.on("close", cleanup);

      req.end();
    });
  }

  async run(
    config: TestConfig,
    onProgress: (data: ProgressData) => void,
    onErrorBatch?: (errors: ErrorDetail[]) => void,
  ): Promise<TestResult> {
    this.cancelled = false;
    this.durationExpired = false;
    this.abortController = new AbortController();
    this.vuRequestCount = 0;
    this.runtimeErrorCounts = { timeout: 0, connection: 0, http: 0, dns: 0, unknown: 0 };
    this.errorBuffer = [];
    this.onErrorBatch = onErrorBatch || null;
    this.opMetrics = new Map();
    this.secOperationCounts = new Map();
    validateTestConfig(config);

    // Validação de configuração (defensiva — pode já ter sido validada pelo main process)
    if (!config || typeof config !== "object") {
      throw new Error("Configuração de teste inválida ou ausente.");
    }
    if (
      !config.url ||
      typeof config.url !== "string" ||
      config.url.trim() === ""
    ) {
      throw new Error(
        "URL inválida. Informe o endereço do site que deseja testar.",
      );
    }
    if (!config.virtualUsers || config.virtualUsers < 1) {
      throw new Error(
        "O número de visitantes simultâneos deve ser pelo menos 1.",
      );
    }
    if (!config.duration || config.duration < 1) {
      throw new Error("A duração do teste deve ser pelo menos 1 segundo.");
    }

    let url: URL;
    try {
      url = new URL(config.url);
    } catch {
      throw new Error(
        "O endereço informado não é válido. Verifique se começa com http:// ou https:// — exemplo: https://www.meusite.com.br",
      );
    }

    const isHttps = url.protocol === "https:";

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(
        "Somente endereços http:// e https:// são aceitos. Verifique a URL informada.",
      );
    }

    const signal = this.abortController.signal;
    setMaxListeners(0, signal);
    this.initializeLiveVuActivity(config.virtualUsers);

    // Correção BUG-02: Validar que o host alvo não é interno/privado (proteção SSRF)
    await validateTargetHost(url.hostname);

    // Verificação de conectividade antes de iniciar o teste
    await this.preflight(url, isHttps, signal);

    const maxSockets = Math.min(config.virtualUsers * 2, 10000);
    const agents = {
      http: new http.Agent({
        keepAlive: true,
        maxSockets,
        timeout: 30000,
      }),
      https: new https.Agent({
        keepAlive: true,
        maxSockets,
        timeout: 30000,
      }),
    };
    this.activeAgents = agents;

    // Construir lista de operações: multi-operação ou single-URL
    const operations: TestOperation[] =
      config.operations && config.operations.length > 0
        ? config.operations
        : [
            {
              name: "default",
              url: config.url,
              method: config.method,
              headers: config.headers,
              body: config.body,
              captureSession: false,
            },
          ];

    // Inicializar métricas por operação
    for (const op of operations) {
      this.opMetrics.set(op.name, {
        latencies: [],
        latencySampleCount: 0,
        requests: 0,
        errors: 0,
        statusCodes: {},
        session: {
          authenticatedRequests: 0,
          sessionFailures: 0,
          sessionExpiredErrors: 0,
        },
      });
    }

    // Validar SSRF para todas as URLs de operação
    for (const op of operations) {
      const opUrl = new URL(op.url);
      await validateTargetHost(opUrl.hostname);
    }

    const testId = uuidv4();
    const startTime = new Date();
    // Reservoir sampling para limitar uso de memória em testes longos
    const latencyReservoir: number[] = [];
    const RESERVOIR_MAX = 100_000;
    let latencySampleCount = 0;
    const globalStatusCodes: Record<string, number> = {};
    let totalErrors = 0;
    let totalBytes = 0;
    let totalRequests = 0;

    // Protection Detection Engine — análise incremental com amostragem
    const protectionDetector = new ProtectionDetector();

    let secLatencies: number[] = [];
    let secErrors = 0;
    let secRequests = 0;
    let secBytes = 0;
    let secStatusCodes: Record<string, number> = {};
    let secRuntimeClientErrors = { timeout: 0, connection: 0 };
    let currentSecond = 0;

    const timeline: SecondMetrics[] = [];
    const runtimeErrorTimeline: RuntimeErrorSecondMetrics[] = [];
    const rampUp = config.rampUp || 0;

    // Publica um snapshot inicial assim que o preflight termina.
    // Isso confirma para a UI que o CPX-Stress realmente entrou em execução,
    // sem precisar esperar o primeiro tick de 1s.
    onProgress({
      currentSecond: 0,
      totalSeconds: config.duration,
      metrics: {
        timestamp: Date.now(),
        second: 0,
        requests: 0,
        errors: 0,
        latencyAvg: 0,
        latencyP50: 0,
        latencyP90: 0,
        latencyP95: 0,
        latencyP99: 0,
        latencyMax: 0,
        latencyMin: 0,
        statusCodes: {},
        bytesReceived: 0,
        activeUsers: rampUp > 0 ? 0 : config.virtualUsers,
      },
      cumulative: {
        totalRequests: 0,
        totalErrors: 0,
        rps: 0,
      },
      liveActivity: this.buildLiveActivity(config.virtualUsers),
    });

    const interval = setInterval(() => {
      if (this.cancelled) return;
      currentSecond++;
      const activeUsers =
        rampUp > 0
          ? Math.min(
              config.virtualUsers,
              Math.ceil((currentSecond / rampUp) * config.virtualUsers),
            )
          : config.virtualUsers;

      const sorted = [...secLatencies].sort((a, b) => a - b);
      const metrics: SecondMetrics = {
        timestamp: Date.now(),
        second: currentSecond,
        requests: secRequests,
        errors: secErrors,
        latencyAvg:
          sorted.length > 0
            ? round2(sorted.reduce((a, b) => a + b, 0) / sorted.length)
            : 0,
        latencyP50: round2(percentile(sorted, 50)),
        latencyP90: round2(percentile(sorted, 90)),
        latencyP95: round2(percentile(sorted, 95)),
        latencyP99: round2(percentile(sorted, 99)),
        latencyMax: sorted.length > 0 ? round2(sorted[sorted.length - 1]) : 0,
        latencyMin: sorted.length > 0 ? round2(sorted[0]) : 0,
        statusCodes: { ...secStatusCodes },
        bytesReceived: secBytes,
        activeUsers,
      };

      timeline.push(metrics);
      runtimeErrorTimeline.push({
        second: currentSecond,
        timeoutErrors: secRuntimeClientErrors.timeout,
        connectionErrors: secRuntimeClientErrors.connection,
      });
      const liveActivity = this.buildLiveActivity(config.virtualUsers);
      onProgress({
        currentSecond,
        totalSeconds: config.duration,
        metrics,
        cumulative: {
          totalRequests,
          totalErrors,
          rps: currentSecond > 0 ? round2(totalRequests / currentSecond) : 0,
        },
        liveActivity,
      });

      secLatencies = [];
      secErrors = 0;
      secRequests = 0;
      secBytes = 0;
      secStatusCodes = {};
      secRuntimeClientErrors = { timeout: 0, connection: 0 };
      this.secOperationCounts = new Map();
    }, 1000);
    this.activeInterval = interval;

    const endTime = Date.now() + config.duration * 1000;

    // Timer de segurança: abortar requests in-flight quando a duração expirar
    // Sem isso, VUs com requests lentos (ex: latência >30s) ficam presos além da duração
    this.activeDurationTimer = setTimeout(
      () => {
        this.durationExpired = true;
        this.abortController?.abort();
      },
      config.duration * 1000 + 2000,
    ); // +2s de margem para finalização natural

    const vuPromises: Promise<void>[] = [];

    // Callbacks de resposta/erro extraídos — reutilizados nos modos
    // single-threaded e multi-threaded (worker_threads).
    const handleResponse = (
      vuId: number,
      latency: number,
      statusCode: number,
      bytes: number,
      operationName: string,
      targetLabel: string,
      method: string,
      captureSession: boolean,
      sample?: ResponseSample,
      sessionInvalid: boolean = false,
      failureMessage?: string,
    ) => {
      // Reservoir sampling: manter no máximo RESERVOIR_MAX amostras
      latencySampleCount++;
      if (latencyReservoir.length < RESERVOIR_MAX) {
        latencyReservoir.push(latency);
      } else {
        const j = Math.floor(Math.random() * latencySampleCount);
        if (j < RESERVOIR_MAX) {
          latencyReservoir[j] = latency;
        }
      }
      secLatencies.push(latency);
      secRequests++;
      totalRequests++;
      totalBytes += bytes;
      secBytes += bytes;
      this.noteOperationSecondCount(operationName, "request");
      const isError = statusCode >= 400 || sessionInvalid;
      const code = String(statusCode);
      globalStatusCodes[code] = (globalStatusCodes[code] || 0) + 1;
      secStatusCodes[code] = (secStatusCodes[code] || 0) + 1;
      if (isError) {
        totalErrors++;
        secErrors++;
        this.noteOperationSecondCount(operationName, "error");
      }

      this.updateVuActivity(vuId, {
        state: isError ? "error" : "success",
        operationName,
        targetLabel,
        method,
        statusCode,
        latencyMs: round2(latency),
        message: isError
          ? failureMessage || `Resposta HTTP ${statusCode}.`
          : "Resposta concluída com sucesso.",
      });
      this.updateVuResultSummary(vuId, {
        finalState: isError ? "error" : "success",
        lastOperationName: operationName,
        lastTargetLabel: targetLabel,
        lastMethod: method,
        lastStatusCode: statusCode,
        lastLatencyMs: round2(latency),
        lastMessage: isError
          ? failureMessage || `Resposta HTTP ${statusCode}.`
          : "Resposta concluída com sucesso.",
        outcomeKey: String(statusCode),
        incrementTotalRequests: true,
        incrementSuccess: !isError,
        incrementFailure: isError,
      });

      // Métricas por operação
      const opMet = this.opMetrics.get(operationName);
      if (opMet) {
        opMet.latencySampleCount++;
        if (opMet.latencies.length < RESERVOIR_MAX) {
          opMet.latencies.push(latency);
        } else {
          const j = Math.floor(Math.random() * opMet.latencySampleCount);
          if (j < RESERVOIR_MAX) {
            opMet.latencies[j] = latency;
          }
        }
        opMet.requests++;
        if (isError) {
          opMet.errors++;
        }
        opMet.statusCodes[code] = (opMet.statusCodes[code] || 0) + 1;

        if (captureSession) {
          if (sessionInvalid) {
            opMet.session.sessionFailures++;
            opMet.session.sessionExpiredErrors++;
          } else if (statusCode === 401 || statusCode === 403) {
            opMet.session.sessionFailures++;
            opMet.session.sessionExpiredErrors++;
          } else if (statusCode < 400) {
            opMet.session.authenticatedRequests++;
          } else {
            opMet.session.sessionFailures++;
          }
        }
      }

      // Capturar erros HTTP (4xx, 5xx) como ErrorDetail
      if (statusCode >= 400) {
        this.runtimeErrorCounts.http++;
        this.captureError(
          testId,
          operationName,
          statusCode,
          "http",
          `HTTP ${statusCode}`,
          undefined,
        );
      } else if (sessionInvalid) {
        this.runtimeErrorCounts.unknown++;
        this.captureError(
          testId,
          operationName,
          statusCode,
          "unknown",
          failureMessage || "Falha lógica do fluxo MisterT.",
          undefined,
        );
      }

      // Alimentar Protection Detector com amostras
      if (sample) {
        protectionDetector.collectSample(sample);
      }
    };

    const handleError = (
      vuId: number,
      errorMsg: string,
      operationName: string,
      targetLabel: string,
      method: string,
    ) => {
      totalErrors++;
      secErrors++;
      totalRequests++;
      secRequests++;
      this.noteOperationSecondCount(operationName, "request");
      this.noteOperationSecondCount(operationName, "error");
      this.updateVuActivity(vuId, {
        state: "error",
        operationName,
        targetLabel,
        method,
        message: errorMsg,
      });
      const errorType = this.classifyError(errorMsg);
      this.updateVuResultSummary(vuId, {
        finalState: "error",
        lastOperationName: operationName,
        lastTargetLabel: targetLabel,
        lastMethod: method,
        lastMessage: errorMsg,
        outcomeKey: errorType,
        incrementTotalRequests: true,
        incrementFailure: true,
      });

      // Métricas por operação
      const opMet = this.opMetrics.get(operationName);
      if (opMet) {
        opMet.errors++;
        opMet.requests++;
      }

      // Capturar erro detalhado
      this.runtimeErrorCounts[errorType]++;
      if (errorType === "timeout" || errorType === "connection") {
        secRuntimeClientErrors[errorType]++;
      }
      this.captureError(
        testId,
        operationName,
        0,
        errorType,
        errorMsg,
        undefined,
      );
    };

    const handleVuActivity = (activity: LiveVuActivitySnapshot) => {
      this.updateVuActivity(activity.vuId, activity);
      this.updateVuResultSummary(activity.vuId, {
        finalState: activity.state,
        lastOperationName: activity.operationName,
        lastTargetLabel: activity.targetLabel,
        lastMethod: activity.method,
        lastStatusCode: activity.statusCode,
        lastLatencyMs: activity.latencyMs,
        lastUpdatedAt: activity.updatedAt,
        lastMessage: activity.message,
      });
    };

    // Modo de execução: worker threads para cargas altas, single-threaded para cargas normais
    const useWorkers = config.virtualUsers > WORKER_THREAD_THRESHOLD;

    if (useWorkers) {
      await this.executeWithWorkers(
        config,
        operations,
        endTime,
        handleResponse,
        handleError,
        handleVuActivity,
        signal,
      );
    } else {
      for (let i = 0; i < config.virtualUsers; i++) {
        const delay =
          rampUp > 0
            ? Math.floor((i / config.virtualUsers) * rampUp * 1000)
            : 0;

        vuPromises.push(
          this.spawnVU(delay, {
            vuId: i + 1,
            operations,
            isHttps,
            agents,
            config,
            endTime,
            signal,
            testId,
            onResponse: handleResponse,
            onError: handleError,
            onVuActivity: handleVuActivity,
          }),
        );
      }

      try {
        await Promise.all(vuPromises);
      } catch {
        // Cancelled or error — handled below
      }
    }

    if (this.activeDurationTimer) {
      clearTimeout(this.activeDurationTimer);
      this.activeDurationTimer = null;
    }
    clearInterval(interval);
    this.activeInterval = null;

    // Correção BUG-01: Flush dos dados residuais do último segundo na timeline
    if (secRequests > 0 || secErrors > 0) {
      currentSecond++;
      const activeUsers =
        rampUp > 0
          ? Math.min(
              config.virtualUsers,
              Math.ceil((currentSecond / rampUp) * config.virtualUsers),
            )
          : config.virtualUsers;

      const sorted = [...secLatencies].sort((a, b) => a - b);
      const metrics: SecondMetrics = {
        timestamp: Date.now(),
        second: currentSecond,
        requests: secRequests,
        errors: secErrors,
        latencyAvg:
          sorted.length > 0
            ? round2(sorted.reduce((a, b) => a + b, 0) / sorted.length)
            : 0,
        latencyP50: round2(percentile(sorted, 50)),
        latencyP90: round2(percentile(sorted, 90)),
        latencyP95: round2(percentile(sorted, 95)),
        latencyP99: round2(percentile(sorted, 99)),
        latencyMax: sorted.length > 0 ? round2(sorted[sorted.length - 1]) : 0,
        latencyMin: sorted.length > 0 ? round2(sorted[0]) : 0,
        statusCodes: { ...secStatusCodes },
        bytesReceived: secBytes,
        activeUsers,
      };
      timeline.push(metrics);
      runtimeErrorTimeline.push({
        second: currentSecond,
        timeoutErrors: secRuntimeClientErrors.timeout,
        connectionErrors: secRuntimeClientErrors.connection,
      });
      const liveActivity = this.buildLiveActivity(config.virtualUsers);
      onProgress({
        currentSecond,
        totalSeconds: config.duration,
        metrics,
        cumulative: {
          totalRequests,
          totalErrors,
          rps: currentSecond > 0 ? round2(totalRequests / currentSecond) : 0,
        },
        liveActivity,
      });
      secRuntimeClientErrors = { timeout: 0, connection: 0 };
      this.secOperationCounts = new Map();
    }

    agents.http.destroy();
    agents.https.destroy();
    this.activeAgents = { http: null, https: null };

    const actualEnd = new Date();
    const actualDuration = (actualEnd.getTime() - startTime.getTime()) / 1000;
    const sortedAll = latencyReservoir.sort((a, b) => a - b);

    const result: TestResult = {
      id: testId,
      url: config.url,
      config,
      startTime: startTime.toISOString(),
      endTime: actualEnd.toISOString(),
      durationSeconds: round2(actualDuration),
      totalRequests,
      totalErrors,
      rps: round2(totalRequests / Math.max(actualDuration, 0.1)),
      latency: {
        avg:
          sortedAll.length > 0
            ? round2(sortedAll.reduce((a, b) => a + b, 0) / sortedAll.length)
            : 0,
        min: sortedAll.length > 0 ? round2(sortedAll[0]) : 0,
        p50: round2(percentile(sortedAll, 50)),
        p90: round2(percentile(sortedAll, 90)),
        p95: round2(percentile(sortedAll, 95)),
        p99: round2(percentile(sortedAll, 99)),
        max: sortedAll.length > 0 ? round2(sortedAll[sortedAll.length - 1]) : 0,
      },
      errorRate:
        totalRequests > 0 ? round2((totalErrors / totalRequests) * 100) : 0,
      throughputBytesPerSec: round2(totalBytes / Math.max(actualDuration, 0.1)),
      totalBytes,
      statusCodes: globalStatusCodes,
      timeline,
      status:
        this.cancelled && !this.durationExpired ? "cancelled" : "completed",
    };

    const measurementReliability = this.buildMeasurementReliability({
      config,
      timeline,
      runtimeErrorTimeline,
      totalRequests,
      actualDuration,
      timeoutErrors: this.runtimeErrorCounts.timeout,
      connectionErrors: this.runtimeErrorCounts.connection,
      usedReservoirSampling: totalRequests > RESERVOIR_MAX,
    });
    result.measurementReliability = measurementReliability;
    result.operationalWarnings = measurementReliability.warnings;

    // Distribuição de erros por tipo
    const eb = this.runtimeErrorCounts;
    if (eb.timeout + eb.connection + eb.http + eb.dns + eb.unknown > 0) {
      result.errorBreakdown = { ...eb };
    }

    result.vuResults = [...this.vuResultSummaries.values()].sort(
      (a, b) => a.vuId - b.vuId,
    );

    // Flush de erros restantes no buffer
    this.flushErrors();

    // Gerar métricas por operação (apenas para testes multi-operação)
    if (operations.length > 1) {
      const opMetricsResult: Record<string, OperationMetrics> = {};
      for (const [name, met] of this.opMetrics.entries()) {
        const sorted = [...met.latencies].sort((a, b) => a - b);
        opMetricsResult[name] = {
          name,
          totalRequests: met.requests,
          totalErrors: met.errors,
          errorRate:
            met.requests > 0 ? round2((met.errors / met.requests) * 100) : 0,
          rps: round2(met.requests / Math.max(actualDuration, 0.1)),
          latency: {
            avg:
              sorted.length > 0
                ? round2(sorted.reduce((a, b) => a + b, 0) / sorted.length)
                : 0,
            min: sorted.length > 0 ? round2(sorted[0]) : 0,
            p50: round2(percentile(sorted, 50)),
            p90: round2(percentile(sorted, 90)),
            p95: round2(percentile(sorted, 95)),
            p99: round2(percentile(sorted, 99)),
            max: sorted.length > 0 ? round2(sorted[sorted.length - 1]) : 0,
          },
          statusCodes: met.statusCodes,
          sessionMetrics:
            met.session.authenticatedRequests > 0 ||
            met.session.sessionFailures > 0 ||
            met.session.sessionExpiredErrors > 0
              ? {
                  authenticatedRequests: met.session.authenticatedRequests,
                  sessionFailures: met.session.sessionFailures,
                  sessionExpiredErrors: met.session.sessionExpiredErrors,
                  consistencyScore:
                    met.requests > 0
                      ? round2(
                          (met.session.authenticatedRequests / met.requests) *
                            100,
                        )
                      : 0,
                }
              : undefined,
        };
      }
      result.operationMetrics = opMetricsResult;
    }

    // Gerar relatório de detecção de proteção
    protectionDetector.setTimeline(timeline);
    result.protectionReport = protectionDetector.analyze();

    return result;
  }

  private async spawnVU(
    delay: number,
    opts: {
      vuId: number;
      operations: TestOperation[];
      isHttps: boolean;
      agents: {
        http: http.Agent;
        https: https.Agent;
      };
      config: TestConfig;
      endTime: number;
      signal: AbortSignal;
      testId: string;
      onResponse: (
        vuId: number,
        latency: number,
        statusCode: number,
        bytes: number,
        operationName: string,
        targetLabel: string,
        method: string,
        captureSession: boolean,
        sample?: ResponseSample,
        sessionInvalid?: boolean,
      ) => void;
      onError: (
        vuId: number,
        errorMsg: string,
        operationName: string,
        targetLabel: string,
        method: string,
      ) => void;
      onVuActivity: (activity: LiveVuActivitySnapshot) => void;
    },
  ): Promise<void> {
    if (delay > 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        opts.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }

    // Cada VU mantém seu próprio CookieJar para simular sessão independente
    const cookieJar = new CookieJar();

    // Variáveis extraídas de respostas anteriores (Response Extraction)
    // Ex: { "CTRL": "1048389603" } — usado em {{CTRL}} nas operações seguintes
    const extractedVars = new Map<string, string>();

    // Helper: executa uma única operação (reutilizado nos modos sequencial e aleatório)
    const executeOp = async (
      op: TestOperation,
    ): Promise<{
      finalUrl?: URL;
      sessionInvalid: boolean;
      requestFailed: boolean;
      failureMessage?: string;
    }> => {
      if (Date.now() >= opts.endTime || opts.signal.aborted) {
        return {
          finalUrl: undefined,
          sessionInvalid: false,
          requestFailed: false,
        };
      }

      const resolvedUrl = this.resolveExtractVars(op.url, extractedVars);
      const resolvedBody = op.body
        ? this.resolveExtractVars(op.body, extractedVars)
        : undefined;
      const resolvedHeaders = op.headers
        ? this.resolveExtractHeaders(op.headers, extractedVars)
        : undefined;
      const unresolvedPlaceholders = [
        ...getUnresolvedPlaceholderNames(resolvedUrl),
        ...getUnresolvedPlaceholderNames(resolvedBody),
        ...Object.values(resolvedHeaders ?? {}).flatMap(
          getUnresolvedPlaceholderNames,
        ),
      ];

      if (
        hasUnresolvedPlaceholders(resolvedUrl) ||
        hasUnresolvedPlaceholders(resolvedBody) ||
        Object.values(resolvedHeaders ?? {}).some(hasUnresolvedPlaceholders)
      ) {
        const failureMessage = `Placeholders não resolvidos: ${[
          ...new Set(unresolvedPlaceholders),
        ].join(", ")}.`;
        opts.onVuActivity({
          vuId: opts.vuId,
          state: "error",
          operationName: op.name,
          targetLabel: "Fluxo inválido",
          method: op.method,
          updatedAt: Date.now(),
          message: failureMessage,
        });
        return {
          finalUrl: undefined,
          sessionInvalid: true,
          requestFailed: false,
          failureMessage,
        };
      }

      const opUrl = new URL(resolvedUrl);
      const opIsHttps = opUrl.protocol === "https:";
      const start = performance.now();
      const hasExtract = op.extract && Object.keys(op.extract).length > 0;
      const hasRejectTexts = !!op.validation?.rejectOnAnyText?.length;
      const expectsAnyText = !!op.validation?.expectedAnyText?.length;
      const rejectLoginLikeContent =
        op.validation?.rejectLoginLikeContent ?? op.name !== "Página de Login";

      this.vuRequestCount++;
      const captureSample = this.vuRequestCount % 50 === 1;

      const targetLabel = this.sanitizeTargetLabel(opUrl);
      opts.onVuActivity({
        vuId: opts.vuId,
        state: "requesting",
        operationName: op.name,
        targetLabel,
        method: op.method,
        updatedAt: Date.now(),
        message: "Requisição em andamento.",
      });

      try {
        const result = await this.makeRequest(
          {
            url: opUrl,
            isHttps: opIsHttps,
            agent: opIsHttps ? opts.agents.https : opts.agents.http,
            signal: opts.signal,
            method: op.method,
            headers: resolvedHeaders,
            body: resolvedBody,
            cookieJar,
            captureSession: op.captureSession !== false,
            collectBody:
              hasExtract ||
              hasRejectTexts ||
              expectsAnyText ||
              rejectLoginLikeContent,
          },
          captureSample,
        );

        const failureReasons: string[] = [];
        if (hasExtract && result.bodyText) {
          const missingExtractors: string[] = [];
          for (const [varName, pattern] of Object.entries(op.extract!)) {
            try {
              const regex = new RegExp(pattern);
              const match = regex.exec(result.bodyText);
              if (match && match[1]) {
                extractedVars.set(varName, match[1]);
              } else {
                missingExtractors.push(varName);
              }
            } catch {
              missingExtractors.push(varName);
            }
          }

          if (missingExtractors.length > 0) {
            failureReasons.push(
              `Extractor(es) ausente(s): ${missingExtractors.join(", ")}.`,
            );
          }
        } else if (hasExtract) {
          failureReasons.push("Corpo vazio ao tentar extrair variáveis dinâmicas.");
        }

        // Detectar página de erro de sessão via conteúdo (ex: "Este erro nunca deve ocorrer")
        let sessionInvalid = false;
        if (hasRejectTexts && result.bodyText) {
          for (const text of op.validation!.rejectOnAnyText!) {
            if (result.bodyText.includes(text)) {
              sessionInvalid = true;
              failureReasons.push(
                `Texto proibido encontrado na resposta: ${text}.`,
              );
              break;
            }
          }
        }

        if (
          rejectLoginLikeContent &&
          result.bodyText &&
          detectLoginLikeContent(result.bodyText)
        ) {
          sessionInvalid = true;
          failureReasons.push(
            "A resposta parece a tela de login do MisterT, não a aba esperada.",
          );
        }

        if (expectsAnyText && result.bodyText) {
          const expectedMatches = getExpectedTextMatches(
            result.bodyText,
            op.validation,
          );
          if (expectedMatches.length === 0) {
            sessionInvalid = true;
            failureReasons.push(
              `Nenhum texto esperado foi encontrado: ${op.validation!.expectedAnyText!.join(", ")}.`,
            );
          }
        }

        const latency = performance.now() - start;
        const failureMessage =
          failureReasons.length > 0 ? failureReasons.join(" ") : undefined;
        opts.onResponse(
          opts.vuId,
          latency,
          result.statusCode,
          result.bytes,
          op.name,
          targetLabel,
          op.method,
          op.captureSession !== false,
          result.sample,
          sessionInvalid,
          failureMessage,
        );
        return {
          finalUrl: result.finalUrl,
          sessionInvalid,
          requestFailed: false,
          failureMessage,
        };
      } catch (err) {
        if (!opts.signal.aborted) {
          const msg = err instanceof Error ? err.message : String(err);
          opts.onError(opts.vuId, msg, op.name, targetLabel, op.method);
          return {
            finalUrl: undefined,
            sessionInvalid: false,
            requestFailed: true,
            failureMessage: msg,
          };
        }
        return {
          finalUrl: undefined,
          sessionInvalid: false,
          requestFailed: false,
        };
      }
    };

    const firstModuleIndex = opts.operations.findIndex(
      (operation) =>
        typeof operation.moduleGroup === "string" &&
        operation.moduleGroup.trim() !== "",
    );
    const authOps =
      firstModuleIndex >= 0
        ? opts.operations.slice(0, firstModuleIndex)
        : opts.operations;
    const moduleOps =
      firstModuleIndex >= 0 ? opts.operations.slice(firstModuleIndex) : [];
    const moduleFlows: TestOperation[][] = [];

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

    // Determinar pathname da página de login para detecção de expiração de sessão
    // Quando um módulo retorna redirect para está pathname, a sessão expirou
    const loginUrl = authOps.length > 0 ? new URL(authOps[0].url) : null;
    let authenticated = authOps.length === 0;

    const runAuth = async (): Promise<boolean> => {
      cookieJar.clear();
      extractedVars.clear();

      for (const op of authOps) {
        const outcome = await executeOp(op);
        if (outcome.requestFailed || outcome.sessionInvalid) {
          return false;
        }
      }

      return true;
    };

    if (authOps.length > 0) {
      authenticated = await runAuth();
    }

    // Loop principal — apenas operações de módulo (sem re-autenticação desnecessária)
    while (Date.now() < opts.endTime && !opts.signal.aborted) {
      if (!authenticated) {
        authenticated = await runAuth();
        if (!authenticated) {
          continue;
        }
      }

      if (moduleFlows.length === 0) {
        // Modo single-op ou auth-only: mantém comportamento original
        // (sem módulos, o loop continua executando authOps)
        for (const op of authOps) {
          const outcome = await executeOp(op);
          if (outcome.requestFailed || outcome.sessionInvalid) {
            authenticated = false;
            break;
          }
        }
        continue;
      }

      const randomFlow =
        moduleFlows[Math.floor(Math.random() * moduleFlows.length)];
      let sessionExpired = false;

      for (const operation of randomFlow) {
        const opResult = await executeOp(operation);
        const finalUrl = opResult.finalUrl;

        sessionExpired =
          opResult.sessionInvalid ||
          (loginUrl !== null &&
            finalUrl !== undefined &&
            finalUrl.pathname.toLowerCase() === loginUrl.pathname.toLowerCase() &&
            finalUrl.searchParams.toString() === loginUrl.searchParams.toString());

        if (sessionExpired || opResult.requestFailed) {
          break;
        }
      }

      if (sessionExpired) {
        // Limpar estado de sessão antiga antes de re-autenticar
        opts.onVuActivity({
          vuId: opts.vuId,
          state: "reauthenticating",
          operationName: "Reautenticando sessão",
          targetLabel: "Fluxo de login",
          method: "POST",
          updatedAt: Date.now(),
          message: "Sessão expirada; refazendo autenticação.",
        });
        authenticated = false;
      }
    }
  }

  /**
   * Substitui placeholders {{VAR}} em uma string usando variáveis extraídas.
   * Ex: "MisterT.asp?CTRL={{CTRL}}&R=89" → "MisterT.asp?CTRL=1048389603&R=89"
   */
  private resolveExtractVars(
    text: string,
    vars: Map<string, string>,
  ): string {
    if (vars.size === 0 || !text.includes("{{")) return text;
    return text.replace(/\{\{([^}]+)\}\}/g, (match, varName: string) => {
      return vars.get(varName) ?? match;
    });
  }

  /**
   * Resolve placeholders em todas as values dos headers.
   */
  private resolveExtractHeaders(
    headers: Record<string, string>,
    vars: Map<string, string>,
  ): Record<string, string> {
    if (vars.size === 0) return headers;
    const resolved: Record<string, string> = {};
    for (const [key, val] of Object.entries(headers)) {
      resolved[key] = this.resolveExtractVars(val, vars);
    }
    return resolved;
  }

  private makeSingleRequest(
    opts: {
      url: URL;
      isHttps: boolean;
      agent: http.Agent | https.Agent;
      signal: AbortSignal;
      method: string;
      headers?: Record<string, string>;
      body?: string;
      cookieJar: CookieJar;
      captureSession: boolean;
      /** Quando true, coleta o corpo da resposta para response extraction. */
      collectBody: boolean;
    },
    captureSample: boolean = false,
  ): Promise<{
    statusCode: number;
    bytes: number;
    sample?: ResponseSample;
    bodyText?: string;
    locationHeader?: string;
  }> {
    return new Promise((resolve, reject) => {
      if (opts.signal.aborted) {
        reject(new Error("Cancelled"));
        return;
      }

      const mod = opts.isHttps ? https : http;
      const mergedHeaders: Record<string, string> = {
        "User-Agent": "CPX-Stress/1.0",
        Accept: "*/*",
        ...opts.headers,
      };

      // Injetar cookies da sessão do VU
      const cookieHeader = opts.cookieJar.toCookieHeader(opts.url);
      if (cookieHeader) {
        mergedHeaders["Cookie"] = cookieHeader;
      }

      const reqOptions: http.RequestOptions = {
        hostname: opts.url.hostname,
        port: opts.url.port || (opts.isHttps ? 443 : 80),
        path: opts.url.pathname + opts.url.search,
        method: opts.method || "GET",
        agent: opts.agent,
        headers: mergedHeaders,
        timeout: 30000,
      };

      if (opts.body && opts.method !== "GET") {
        const existingContentType = Object.keys(
          reqOptions.headers as Record<string, string>,
        ).find((k) => k.toLowerCase() === "content-type");
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
        opts.signal.removeEventListener("abort", abortHandler);
      };

      const abortHandler = () => {
        if (!settled) {
          cleanup();
          req.destroy();
          reject(new Error("Cancelled"));
        }
      };
      opts.signal.addEventListener("abort", abortHandler);

      const req = mod.request(reqOptions, (res) => {
        let bytes = 0;
        const bodyChunks: Buffer[] = [];
        let bodyCollected = 0;
        const BODY_LIMIT = 2048;

        // Buffer separado para response extraction (maior, até 64KB)
        const extractChunks: Buffer[] = [];
        let extractCollected = 0;
        const EXTRACT_LIMIT = 65536;
        const needExtractBody = opts.collectBody;

        // Capturar Set-Cookie headers para manter sessão entre operações
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

          const bodyText = needExtractBody && extractChunks.length > 0
            ? Buffer.concat(extractChunks).toString("utf-8")
            : undefined;

          let sample: ResponseSample | undefined;
          if (captureSample) {
            const headers: Record<string, string> = {};
            const rawHeaders = res.headers;
            for (const [key, val] of Object.entries(rawHeaders)) {
              if (val) {
                headers[key.toLowerCase()] = Array.isArray(val)
                  ? val.join(", ")
                  : val;
              }
            }

            const cookies = setCookieHeaders
              ? setCookieHeaders.map((c) => c.split(";")[0])
              : [];

            const bodySnippet =
              bodyChunks.length > 0
                ? Buffer.concat(bodyChunks)
                    .toString("utf-8")
                    .substring(0, BODY_LIMIT)
                : "";

            sample = {
              statusCode: res.statusCode ?? 0,
              headers,
              cookies,
              bodySnippet,
              timestamp: Date.now(),
            };
          }

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

  /**
   * Executa uma requisição HTTP seguindo até MAX_REDIRECT_HOPS redirects.
   * Captura cookies em cada hop intermediário (essencial para ASP Classic que
   * envia Set-Cookie no 302) e retorna a URL final após todos os redirects.
   */
  private async makeRequest(
    opts: {
      url: URL;
      isHttps: boolean;
      agent: http.Agent | https.Agent;
      signal: AbortSignal;
      method: string;
      headers?: Record<string, string>;
      body?: string;
      cookieJar: CookieJar;
      captureSession: boolean;
      collectBody: boolean;
    },
    captureSample: boolean = false,
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

    // Selecionar agente correto por protocolo (pode mudar entre hops se scheme mudar)
    const selectAgent = (isHttps: boolean): http.Agent | https.Agent =>
      isHttps ? this.activeAgents.https! : this.activeAgents.http!;

    let lastResult: Awaited<ReturnType<typeof this.makeSingleRequest>> | null = null;

    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      const isLastHop = hop === MAX_REDIRECT_HOPS;
      lastResult = await this.makeSingleRequest(
        {
          ...opts,
          url: currentUrl,
          isHttps: currentIsHttps,
          method: currentMethod,
          body: currentBody,
          agent: selectAgent(currentIsHttps),
          // Coletar body em todos os hops — corpo de redirects é tipicamente vazio
          collectBody: opts.collectBody,
        },
        captureSample,
      );

      const { statusCode, locationHeader } = lastResult;
      const isRedirect = this.isRedirectStatus(statusCode);

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

  /** Verifica se o status HTTP é um redirect (3xx, exceto 304 Not Modified). */
  private isRedirectStatus(statusCode: number): boolean {
    return statusCode >= 300 && statusCode <= 308 && statusCode !== 304;
  }

  /** Classifica o tipo de erro baseado na mensagem. */
  private classifyError(
    errorMsg: string,
  ): "timeout" | "connection" | "dns" | "unknown" {
    const msg = errorMsg.toLowerCase();
    if (msg.includes("timeout") || msg.includes("timed out")) return "timeout";
    if (msg.includes("etimedout")) return "timeout";
    if (
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("epipe") ||
      msg.includes("socket hang up")
    )
      return "connection";
    if (
      msg.includes("enotfound") ||
      msg.includes("dns") ||
      msg.includes("getaddrinfo")
    )
      return "dns";
    return "unknown";
  }

  private buildMeasurementReliability(params: {
    config: TestConfig;
    timeline: SecondMetrics[];
    runtimeErrorTimeline: RuntimeErrorSecondMetrics[];
    totalRequests: number;
    actualDuration: number;
    timeoutErrors: number;
    connectionErrors: number;
    usedReservoirSampling: boolean;
  }): MeasurementReliability {
    const signals = this.collectReliabilitySignals(params);
    const window = this.collectReliabilityWindow(params);
    const warnings: string[] = [];

    if (signals.usedReservoirSampling) {
      warnings.push(
        "Percentis globais aproximados porque o teste usou reservoir sampling.",
      );
    }
    if (signals.steadyStateCv > 30) {
      warnings.push(
        `RPS instável no trecho estável do teste (CV ${signals.steadyStateCv}%).`,
      );
    }
    if (signals.latencyGrowthFactor > 3) {
      warnings.push(
        `A latência do cliente cresceu ${signals.latencyGrowthFactor}x ao longo do teste.`,
      );
    }
    if (signals.throughputDropPercent > 35) {
      warnings.push(
        `A taxa de requests caiu ${signals.throughputDropPercent}% entre o início e o fim do teste.`,
      );
    }
    if (signals.timeoutErrors > 0) {
      warnings.push(
        `${signals.timeoutErrors} timeouts foram registrados pelo cliente do teste.`,
      );
    }
    if (signals.connectionErrors > 0) {
      warnings.push(
        `${signals.connectionErrors} falhas de conexão foram registradas pelo cliente do teste.`,
      );
    }
    if (signals.durationOverrunSeconds > 2) {
      warnings.push(
        `O teste levou ${signals.durationOverrunSeconds}s além da duração configurada para finalizar requests pendentes.`,
      );
    }

    let level: MeasurementReliability["level"] = "high";
    const hasStrongClientPressure =
      signals.connectionErrors > 0 ||
      signals.durationOverrunSeconds > 10 ||
      (signals.timeoutErrors > 0 &&
        signals.durationOverrunSeconds > 5 &&
        (signals.steadyStateCv > 45 ||
          signals.throughputDropPercent > 60 ||
          signals.latencyGrowthFactor > 6));

    if (hasStrongClientPressure) {
      level = "generator-saturated";
    } else if (warnings.length > 0) {
      level = "degraded";
    }

    const summary =
      level === "high"
        ? "A medição foi estável para a carga aplicada."
        : level === "degraded"
          ? "A medição permaneceu utilizável, mas mostrou sinais de instabilidade."
          : "O gerador de carga mostrou sinais claros de saturação e passou a influenciar o resultado.";

    return { level, summary, warnings, signals, window };
  }

  private collectReliabilitySignals(params: {
    config: TestConfig;
    timeline: SecondMetrics[];
    runtimeErrorTimeline: RuntimeErrorSecondMetrics[];
    totalRequests: number;
    actualDuration: number;
    timeoutErrors: number;
    connectionErrors: number;
    usedReservoirSampling: boolean;
  }): MeasurementReliabilitySignals {
    const stableSlice =
      params.timeline.length >= 10
        ? params.timeline.slice(
            Math.floor(params.timeline.length * 0.3),
            Math.max(
              Math.floor(params.timeline.length * 0.8),
              Math.floor(params.timeline.length * 0.3) + 1,
            ),
          )
        : params.timeline;

    const stableRequests = stableSlice
      .map((second) => second.requests)
      .filter((value) => value > 0);
    const stableAverage =
      stableRequests.length > 0
        ? stableRequests.reduce((sum, value) => sum + value, 0) /
          stableRequests.length
        : 0;
    const stableStdDev =
      stableRequests.length > 0
        ? Math.sqrt(
            stableRequests.reduce(
              (sum, value) => sum + (value - stableAverage) ** 2,
              0,
            ) / stableRequests.length,
          )
        : 0;
    const steadyStateCv =
      stableAverage > 0 ? round2((stableStdDev / stableAverage) * 100) : 0;

    const firstThird = params.timeline.slice(
      0,
      Math.max(1, Math.floor(params.timeline.length / 3)),
    );
    const lastThird = params.timeline.slice(
      Math.floor((params.timeline.length * 2) / 3),
    );
    const firstLatency = this.averageMetric(
      firstThird
        .map((second) => second.latencyAvg)
        .filter((value) => value > 0),
    );
    const lastLatency = this.averageMetric(
      lastThird.map((second) => second.latencyAvg).filter((value) => value > 0),
    );
    const firstThroughput = this.averageMetric(
      firstThird.map((second) => second.requests),
    );
    const lastThroughput = this.averageMetric(
      lastThird.map((second) => second.requests),
    );

    const latencyGrowthFactor =
      firstLatency > 0 ? round2(lastLatency / firstLatency) : 1;
    const throughputDropPercent =
      firstThroughput > 0
        ? round2(Math.max(0, (1 - lastThroughput / firstThroughput) * 100))
        : 0;

    return {
      steadyStateCv,
      latencyGrowthFactor,
      throughputDropPercent,
      timeoutErrors: params.timeoutErrors,
      connectionErrors: params.connectionErrors,
      durationOverrunSeconds: round2(
        Math.max(0, params.actualDuration - params.config.duration),
      ),
      usedReservoirSampling: params.usedReservoirSampling,
    };
  }

  private collectReliabilityWindow(params: {
    config: TestConfig;
    timeline: SecondMetrics[];
    runtimeErrorTimeline: RuntimeErrorSecondMetrics[];
    totalRequests: number;
    actualDuration: number;
    timeoutErrors: number;
    connectionErrors: number;
    usedReservoirSampling: boolean;
  }): MeasurementReliability["window"] {
    if (params.timeline.length === 0) {
      return {
        reason: "Sem dados suficientes",
        detail: "O teste não gerou timeline suficiente para estimar a fronteira de confiabilidade.",
      };
    }

    const lastSecond = params.timeline[params.timeline.length - 1]?.second;
    if (!lastSecond) {
      return {
        reason: "Sem dados suficientes",
        detail: "O teste não gerou timeline suficiente para estimar a fronteira de confiabilidade.",
      };
    }

    const windowSize = Math.min(
      12,
      Math.max(5, Math.ceil(params.timeline.length * 0.1)),
    );
    const analysisStartSecond = Math.max(windowSize, (params.config.rampUp || 0) + 1);
    const secondToRuntime = new Map(
      params.runtimeErrorTimeline.map((entry) => [entry.second, entry] as const),
    );

    const baselineEndIndex = params.timeline.findIndex(
      (second) => second.second >= analysisStartSecond,
    );
    if (baselineEndIndex < 0) {
      return {
        fullyReliableUntilSecond: lastSecond,
        reason: "Medição estável até o fim",
        detail: "O teste terminou antes de acumular uma janela estável suficiente para identificar influência.",
      };
    }

    const baselineStartIndex = Math.max(0, baselineEndIndex - windowSize + 1);
    const baselineWindow = params.timeline.slice(
      baselineStartIndex,
      baselineEndIndex + 1,
    );
    const baselineRequests = baselineWindow.map((second) => second.requests);
    const baselineThroughput = this.averageMetric(baselineRequests);
    const baselineLatency = this.averageMetric(
      baselineWindow
        .map((second) => second.latencyAvg)
        .filter((value) => value > 0),
    );

    for (let endIndex = baselineEndIndex + 1; endIndex < params.timeline.length; endIndex++) {
      const startIndex = Math.max(0, endIndex - windowSize + 1);
      const windowTimeline = params.timeline.slice(startIndex, endIndex + 1);
      const windowRequests = windowTimeline
        .map((second) => second.requests)
        .filter((value) => value > 0);
      const requestAverage = this.averageMetric(windowRequests);
      const requestStdDev =
        windowRequests.length > 0
          ? Math.sqrt(
              windowRequests.reduce(
                (sum, value) => sum + (value - requestAverage) ** 2,
                0,
              ) / windowRequests.length,
            )
          : 0;
      const windowCv =
        requestAverage > 0 ? round2((requestStdDev / requestAverage) * 100) : 0;
      const windowLatency = this.averageMetric(
        windowTimeline
          .map((second) => second.latencyAvg)
          .filter((value) => value > 0),
      );
      const latencyGrowth =
        baselineLatency > 0 ? round2(windowLatency / baselineLatency) : 1;
      const throughputDrop =
        baselineThroughput > 0
          ? round2(
              Math.max(0, (1 - requestAverage / baselineThroughput) * 100),
            )
          : 0;
      const windowRuntime = windowTimeline.map(
        (second) =>
          secondToRuntime.get(second.second) || {
            second: second.second,
            timeoutErrors: 0,
            connectionErrors: 0,
          },
      );
      const timeoutErrors = windowRuntime.reduce(
        (sum, second) => sum + second.timeoutErrors,
        0,
      );
      const connectionErrors = windowRuntime.reduce(
        (sum, second) => sum + second.connectionErrors,
        0,
      );

      let reason: string | null = null;
      let detail: string | null = null;

      if (connectionErrors > 0) {
        reason = "Falhas de conexão do cliente";
        detail = `${connectionErrors} falha(s) de conexão apareceram a partir deste trecho.`;
      } else if (timeoutErrors > 0) {
        reason = "Timeouts do cliente";
        detail = `${timeoutErrors} timeout(s) ocorreram neste trecho.`;
      } else if (throughputDrop > 35) {
        reason = "Queda de throughput";
        detail = `A taxa média de requests caiu ${throughputDrop}% em relação à base inicial.`;
      } else if (latencyGrowth > 3) {
        reason = "Crescimento de latência";
        detail = `A latência média do cliente cresceu ${latencyGrowth}x em relação à base inicial.`;
      } else if (windowCv > 30) {
        reason = "Instabilidade de RPS";
        detail = `O trecho passou a oscilar com CV de ${windowCv}%.`;
      }

      if (reason && detail) {
        const influencedFromSecond = windowTimeline[0]?.second;
        return {
          fullyReliableUntilSecond:
            influencedFromSecond && influencedFromSecond > 1
              ? influencedFromSecond - 1
              : undefined,
          influencedFromSecond,
          reason,
          detail,
        };
      }
    }

    return {
      fullyReliableUntilSecond: lastSecond,
      reason: "Medição estável até o fim",
      detail: "Nenhum trecho posterior mostrou sinais suficientes para considerar influência da medição.",
    };
  }

  private averageMetric(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  /** Adiciona um erro ao buffer; faz flush quando o buffer atinge o limite. */
  private captureError(
    testId: string,
    operationName: string,
    statusCode: number,
    errorType: "http" | "timeout" | "connection" | "dns" | "unknown",
    message: string,
    responseSnippet?: string,
  ): void {
    if (this.errorBuffer.length >= this.MAX_ERROR_BUFFER) {
      this.flushErrors();
    }

    this.errorBuffer.push({
      id: uuidv4(),
      testId,
      timestamp: Date.now(),
      operationName,
      statusCode,
      errorType,
      message: message.substring(0, 500),
      responseSnippet: responseSnippet?.substring(0, 1024),
    });

    // Flush a cada 1000 erros para não acumular demais em memória
    if (this.errorBuffer.length >= 1000) {
      this.flushErrors();
    }
  }

  /** Envia erros acumulados via callback e limpa o buffer. */
  private flushErrors(): void {
    if (this.errorBuffer.length === 0 || !this.onErrorBatch) return;
    const batch = this.errorBuffer.splice(0);
    this.onErrorBatch(batch);
  }

  /**
   * Executa VUs em worker threads separados.
   * Cada worker roda uma fatia dos VUs com seu próprio event loop,
   * enviando lotes de resultados ao thread principal para agregação.
   */
  private async executeWithWorkers(
    config: {
      virtualUsers: number;
      rampUp?: number;
      operations?: TestOperation[];
      url: string;
      method: string;
      headers?: Record<string, string>;
      body?: string;
    },
    operations: TestOperation[],
    endTime: number,
    onResponse: (
      vuId: number,
      latency: number,
      statusCode: number,
      bytes: number,
      opName: string,
      targetLabel: string,
      method: string,
      captureSession: boolean,
      sample?: ResponseSample,
      sessionInvalid?: boolean,
    ) => void,
    onError: (
      vuId: number,
      errorMsg: string,
      opName: string,
      targetLabel: string,
      method: string,
    ) => void,
    onVuActivity: (activity: LiveVuActivitySnapshot) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const numWorkers = Math.min(os.cpus().length, 8);
    const vusPerWorker = Math.ceil(config.virtualUsers / numWorkers);
    const rampUp = config.rampUp ?? 0;

    const workerPathCandidates = [
      path.join(__dirname, "stress-worker.js"),
      path.resolve(__dirname, "../../dist-electron/stress-worker.js"),
    ];
    const workerPath = workerPathCandidates.find((candidate) =>
      fs.existsSync(candidate),
    );
    if (!workerPath) {
      throw new Error(
        "Worker de stress não encontrado. Gere-o com `npm run build:worker`.",
      );
    }
    const workers: Worker[] = [];
    const workerPromises: Promise<void>[] = [];
    this.activeWorkers = workers;

    for (let w = 0; w < numWorkers; w++) {
      const startVU = w * vusPerWorker;
      const vuCount = Math.min(vusPerWorker, config.virtualUsers - startVU);
      if (vuCount <= 0) break;

      // Calcular delays de ramp-up para os VUs deste worker
      const rampUpDelays: number[] = [];
      for (let i = 0; i < vuCount; i++) {
        const globalVUIndex = startVU + i;
        rampUpDelays.push(
          rampUp > 0
            ? Math.floor(
                (globalVUIndex / config.virtualUsers) * rampUp * 1000,
              )
            : 0,
        );
      }

      const worker = new Worker(workerPath, {
        workerData: {
          vuCount,
          startVuIndex: startVU,
          operations: operations.map((op) => ({
            name: op.name,
            moduleGroup: op.moduleGroup,
            url: op.url,
            method: op.method,
            headers: op.headers,
            body: op.body,
            captureSession: op.captureSession,
            extract: op.extract,
            rejectOnAnyText: op.validation?.rejectOnAnyText,
          })),
          endTime,
          rampUpDelays,
          testId: "",
          maxSockets: Math.ceil((config.virtualUsers * 2) / numWorkers),
        },
      });

      workers.push(worker);

      workerPromises.push(
        new Promise<void>((resolve) => {
          worker.on(
            "message",
            (msg: {
              type: string;
              responses?: Array<{
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
              }>;
              networkErrors?: Array<{
                vuId: number;
                message: string;
                opName: string;
                targetLabel: string;
                method: string;
              }>;
              activityEvents?: LiveVuActivitySnapshot[];
            }) => {
              if (msg.type === "batch") {
                if (msg.responses) {
                  for (const r of msg.responses) {
                    onResponse(
                      r.vuId,
                      r.latency,
                      r.statusCode,
                      r.bytes,
                      r.opName,
                      r.targetLabel,
                      r.method,
                      r.captureSession,
                      r.sample,
                      r.sessionInvalid,
                    );
                  }
                }
                if (msg.networkErrors) {
                  for (const e of msg.networkErrors) {
                    onError(
                      e.vuId,
                      e.message,
                      e.opName,
                      e.targetLabel,
                      e.method,
                    );
                  }
                }
              } else if (msg.type === "activitySnapshot") {
                if (msg.activityEvents) {
                  for (const activity of msg.activityEvents) {
                    onVuActivity(activity);
                  }
                }
              } else if (msg.type === "done") {
                resolve();
              }
            },
          );

          worker.on("error", (err) => {
            console.error("[CPX-Stress] Worker error:", err.message);
            resolve();
          });

          worker.on("exit", () => {
            resolve();
          });
        }),
      );
    }

    // Cancelar workers ao receber abort
    const cancelHandler = () => {
      for (const w of workers) {
        try {
          w.postMessage({ type: "cancel" });
        } catch {
          /* worker may already be terminated */
        }
      }
    };
    signal.addEventListener("abort", cancelHandler, { once: true });

    try {
      await Promise.all(workerPromises);
    } finally {
      signal.removeEventListener("abort", cancelHandler);
      this.activeWorkers = [];
      for (const w of workers) {
        try {
          w.terminate();
        } catch {
          /* ignore */
        }
      }
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.abortController?.abort();
    // Enviar cancel para worker threads ativos
    for (const w of this.activeWorkers) {
      try {
        w.postMessage({ type: "cancel" });
      } catch {
        /* worker may already be terminated */
      }
    }
    if (this.activeDurationTimer) {
      clearTimeout(this.activeDurationTimer);
      this.activeDurationTimer = null;
    }
    if (this.activeInterval) {
      clearInterval(this.activeInterval);
      this.activeInterval = null;
    }
    this.activeAgents.http?.destroy();
    this.activeAgents.https?.destroy();
    this.activeAgents = { http: null, https: null };
  }
}
