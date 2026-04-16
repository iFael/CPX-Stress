import type { K6Config } from "./k6-types";

function buildScriptRuntime(config: K6Config): string {
  return JSON.stringify(config, null, 2);
}

function toMetricSlug(name: string, index: number): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  return `${normalized || "operation"}_${index + 1}`;
}

function buildOperationMetricDefinitions(config: K6Config): string {
  return JSON.stringify(
    (config.flowOperations || []).map((operation, index) => ({
      name: operation.name,
      metricKey: toMetricSlug(operation.name, index),
    })),
    null,
    2,
  );
}

export function generateSimpleScript(config: K6Config): string {
  const runtimeConfig = buildScriptRuntime(config);

  return `import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const RUNTIME_CONFIG = ${runtimeConfig};
const LOGICAL_FAILURES = new Counter('cpx_logical_failures');
const STATUS_COUNTERS = {
  '0': new Counter('cpx_status_0'),
  '200': new Counter('cpx_status_200'),
  '201': new Counter('cpx_status_201'),
  '204': new Counter('cpx_status_204'),
  '301': new Counter('cpx_status_301'),
  '302': new Counter('cpx_status_302'),
  '303': new Counter('cpx_status_303'),
  '304': new Counter('cpx_status_304'),
  '400': new Counter('cpx_status_400'),
  '401': new Counter('cpx_status_401'),
  '403': new Counter('cpx_status_403'),
  '404': new Counter('cpx_status_404'),
  '408': new Counter('cpx_status_408'),
  '429': new Counter('cpx_status_429'),
  '500': new Counter('cpx_status_500'),
  '502': new Counter('cpx_status_502'),
  '503': new Counter('cpx_status_503'),
  '504': new Counter('cpx_status_504'),
  other: new Counter('cpx_status_other'),
};

function countStatus(status) {
  const key = String(status || 0);
  const metric = STATUS_COUNTERS[key] || STATUS_COUNTERS.other;
  metric.add(1);
}

export const options = {
  scenarios: {
    default: {
      executor: 'constant-vus',
      vus: ${config.vus},
      duration: '${config.duration}s',
      gracefulStop: '0s',
    },
  },
};

export function handleSummary(data) {
  return { stdout: JSON.stringify(data) };
}

export default function () {
  const headers = RUNTIME_CONFIG.headers || {};
  const params = { headers };
  const method = (RUNTIME_CONFIG.method || 'GET').toLowerCase();

  const res =
    method === 'get'
      ? http.get(RUNTIME_CONFIG.url, params)
      : http.request(RUNTIME_CONFIG.method || 'GET', RUNTIME_CONFIG.url, RUNTIME_CONFIG.body || null, params);

  countStatus(res.status);

  check(res, {
    'status 2xx': (response) => response.status >= 200 && response.status < 300,
  });
}
`.trim();
}

export function generateFlowScript(config: K6Config): string {
  if (!config.flowOperations?.length) {
    return generateSimpleScript(config);
  }

  const runtimeConfig = buildScriptRuntime(config);
  const operationMetricDefinitions = buildOperationMetricDefinitions(config);

  return `import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const RUNTIME_CONFIG = ${runtimeConfig};
const FLOW_OPERATION_METRIC_DEFS = ${operationMetricDefinitions};
const DEFAULT_TIMEOUT = '30s';
const DEFAULT_REDIRECTS = 5;
const FLOW_SELECTION_MODE = (RUNTIME_CONFIG.flowSelectionMode || 'deterministic').toLowerCase();
const OPERATION_METRICS = Object.fromEntries(
  FLOW_OPERATION_METRIC_DEFS.map((definition) => [
    definition.metricKey,
    {
      requests: new Counter(\`cpx_op_requests__\${definition.metricKey}\`),
      errors: new Counter(\`cpx_op_errors__\${definition.metricKey}\`),
      logicalFailures: new Counter(\`cpx_op_logical__\${definition.metricKey}\`),
    },
  ]),
);
const FLOW_OPERATIONS = (RUNTIME_CONFIG.flowOperations || []).map((operation, index) => ({
  ...operation,
  __metricKey: FLOW_OPERATION_METRIC_DEFS[index]?.metricKey || \`operation_\${index + 1}\`,
}));
const LOGICAL_FAILURES = new Counter('cpx_logical_failures');
const STATUS_COUNTERS = {
  '0': new Counter('cpx_status_0'),
  '200': new Counter('cpx_status_200'),
  '201': new Counter('cpx_status_201'),
  '204': new Counter('cpx_status_204'),
  '301': new Counter('cpx_status_301'),
  '302': new Counter('cpx_status_302'),
  '303': new Counter('cpx_status_303'),
  '304': new Counter('cpx_status_304'),
  '400': new Counter('cpx_status_400'),
  '401': new Counter('cpx_status_401'),
  '403': new Counter('cpx_status_403'),
  '404': new Counter('cpx_status_404'),
  '408': new Counter('cpx_status_408'),
  '429': new Counter('cpx_status_429'),
  '500': new Counter('cpx_status_500'),
  '502': new Counter('cpx_status_502'),
  '503': new Counter('cpx_status_503'),
  '504': new Counter('cpx_status_504'),
  other: new Counter('cpx_status_other'),
};

function countStatus(status) {
  const key = String(status || 0);
  const metric = STATUS_COUNTERS[key] || STATUS_COUNTERS.other;
  metric.add(1);
}

function countOperation(operation, responseStatus, sessionInvalid) {
  const metric = OPERATION_METRICS[operation.__metricKey];
  if (!metric) return;

  metric.requests.add(1);

  if ((responseStatus || 0) >= 400 || sessionInvalid) {
    metric.errors.add(1);
  }

  if (sessionInvalid) {
    metric.logicalFailures.add(1);
  }
}

export const options = {
  scenarios: {
    default: {
      executor: 'constant-vus',
      vus: ${config.vus},
      duration: '${config.duration}s',
      gracefulStop: '0s',
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(50)', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'],
};

const firstModuleIndex = FLOW_OPERATIONS.findIndex(
  (operation) =>
    typeof operation.moduleGroup === 'string' &&
    operation.moduleGroup.trim() !== '',
);

const AUTH_OPS = firstModuleIndex >= 0 ? FLOW_OPERATIONS.slice(0, firstModuleIndex) : FLOW_OPERATIONS;
const MODULE_OPS = firstModuleIndex >= 0 ? FLOW_OPERATIONS.slice(firstModuleIndex) : [];
const MODULE_FLOWS = [];

for (const operation of MODULE_OPS) {
  const groupName = operation.moduleGroup || operation.name;
  const currentFlow = MODULE_FLOWS[MODULE_FLOWS.length - 1];
  const currentGroupName =
    currentFlow && currentFlow.length > 0
      ? currentFlow[0].moduleGroup || currentFlow[0].name
      : null;

  if (currentFlow && currentGroupName === groupName) {
    currentFlow.push(operation);
  } else {
    MODULE_FLOWS.push([operation]);
  }
}

const LOGIN_SIGNATURE = AUTH_OPS.length > 0 ? buildUrlSignature(AUTH_OPS[0].url) : null;
let vuState = null;

function buildUrlSignature(urlText) {
  try {
    const parsed = new URL(urlText);
    return {
      pathname: parsed.pathname.toLowerCase(),
      search: parsed.searchParams.toString(),
    };
  } catch {
    return null;
  }
}

function hasUnresolvedPlaceholders(value) {
  return typeof value === 'string' && /\\{\\{[^}]+\\}\\}/.test(value);
}

function resolveTemplate(value, vars) {
  if (typeof value !== 'string' || !value.includes('{{')) return value;

  return value.replace(/\\{\\{(\\w+)\\}\\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

function resolveHeaders(headers, vars) {
  if (!headers) return undefined;
  const resolved = {};
  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = resolveTemplate(value, vars);
  }
  return resolved;
}

function buildCookieHeader(cookies) {
  const entries = Object.entries(cookies || {}).filter(([, value]) => typeof value === 'string' && value !== '');
  if (entries.length === 0) {
    return undefined;
  }

  return entries.map(([name, value]) => name + '=' + value).join('; ');
}

function captureResponseCookies(response, state) {
  if (!response || !response.cookies) {
    return;
  }

  for (const [cookieName, cookieEntries] of Object.entries(response.cookies)) {
    const firstCookie = Array.isArray(cookieEntries) ? cookieEntries[0] : null;
    if (firstCookie && typeof firstCookie.value === 'string' && firstCookie.value !== '') {
      state.cookies[cookieName] = firstCookie.value;
    }
  }
}

function ensureState() {
  if (!vuState) {
    vuState = {
      vars: {},
      cookies: {},
      authenticated: false,
      nextFlowIndex: 0,
    };
  }
  return vuState;
}

function buildParams(operation, headers, state) {
  const requestHeaders = {
    Accept: '*/*',
    'User-Agent': 'CPX-Stress/1.0',
    ...(headers || {}),
  };
  const cookieHeader = buildCookieHeader(state.cookies);

  if (cookieHeader && !Object.keys(requestHeaders).some((header) => header.toLowerCase() === 'cookie')) {
    requestHeaders.Cookie = cookieHeader;
  }

  if (
    operation.body &&
    operation.method !== 'GET' &&
    !Object.keys(requestHeaders).some((header) => header.toLowerCase() === 'content-type')
  ) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  return {
    headers: requestHeaders,
    redirects: DEFAULT_REDIRECTS,
    timeout: DEFAULT_TIMEOUT,
    tags: {
      name: operation.name,
      operation_name: operation.name,
      module_group: operation.moduleGroup || operation.name,
    },
  };
}

function normalizeValidationText(value) {
  return String(value || '')
    .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/\\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function detectLoginLikeContent(value) {
  const normalized = normalizeValidationText(value);
  return (
    normalized.includes('bem vindo') &&
    normalized.includes('nome') &&
    normalized.includes('senha')
  );
}

function executeOperation(operation, state) {
  const url = resolveTemplate(operation.url, state.vars);
  const headers = resolveHeaders(operation.headers, state.vars);
  const body = operation.body ? resolveTemplate(operation.body, state.vars) : null;

  if (
    hasUnresolvedPlaceholders(url) ||
    hasUnresolvedPlaceholders(body) ||
    (headers && Object.values(headers).some((value) => hasUnresolvedPlaceholders(value)))
  ) {
    throw new Error('Fluxo k6 inválido: placeholder dinâmico não resolvido.');
  }

  const params = buildParams(operation, headers, state);
  const response =
    operation.method.toUpperCase() === 'GET'
      ? http.get(url, params)
      : http.request(operation.method.toUpperCase(), url, body, params);

  if (operation.captureSession) {
    captureResponseCookies(response, state);
  }

  countStatus(response.status);

  const failureReasons = [];
  if (Array.isArray(operation.extractors) && typeof response.body === 'string') {
    for (const extractor of operation.extractors) {
      try {
        const regex = new RegExp(extractor.regex);
        const match = response.body.match(regex);
        if (match && typeof match[1] === 'string' && match[1] !== '') {
          state.vars[extractor.varName] = match[1];
        } else {
          failureReasons.push(\`Extractor ausente: \${extractor.varName}\`);
        }
      } catch {
        failureReasons.push(\`Regex inválida: \${extractor.varName}\`);
      }
    }
  }

  let sessionInvalid = false;
  if (Array.isArray(operation.rejectTexts) && typeof response.body === 'string') {
    for (const text of operation.rejectTexts) {
      if (typeof text === 'string' && text !== '' && response.body.includes(text)) {
        sessionInvalid = true;
        failureReasons.push(\`Texto proibido encontrado: \${text}\`);
        break;
      }
    }
  }

  const rejectLoginLikeContent =
    typeof operation.rejectLoginLikeContent === 'boolean'
      ? operation.rejectLoginLikeContent
      : operation.name !== 'Página de Login';
  if (
    rejectLoginLikeContent &&
    typeof response.body === 'string' &&
    detectLoginLikeContent(response.body)
  ) {
    sessionInvalid = true;
    failureReasons.push('A resposta parece a tela de login do MisterT.');
  }

  if (Array.isArray(operation.expectedTexts) && operation.expectedTexts.length > 0) {
    const normalizedBody = normalizeValidationText(response.body || '');
    const expectedMatch = operation.expectedTexts.some((candidate) =>
      normalizedBody.includes(normalizeValidationText(candidate)),
    );
    if (!expectedMatch) {
      sessionInvalid = true;
      failureReasons.push('Nenhum texto esperado foi encontrado na resposta.');
    }
  }

  if (!sessionInvalid && LOGIN_SIGNATURE) {
    const finalSignature = buildUrlSignature(response.url || url);
    if (
      finalSignature &&
      finalSignature.pathname === LOGIN_SIGNATURE.pathname &&
      finalSignature.search === LOGIN_SIGNATURE.search &&
      operation.name !== AUTH_OPS[0].name
    ) {
      sessionInvalid = true;
      failureReasons.push('Sessão expirada ou redirecionada para login.');
    }
  }

  if (sessionInvalid) {
    LOGICAL_FAILURES.add(1);
  }

  countOperation(operation, response.status, sessionInvalid);

  check(response, {
    [\`\${operation.name} ok\`]: (res) => res.status < 400 && !sessionInvalid,
  });

  return { response, sessionInvalid };
}

function runAuth(state) {
  if (AUTH_OPS.length === 0) {
    state.authenticated = true;
    return;
  }

  for (const operation of AUTH_OPS) {
    executeOperation(operation, state);
  }

  state.authenticated = true;
}

function resetSession(state) {
  state.vars = {};
  state.cookies = {};
  state.authenticated = false;
}

function selectNextFlow(state) {
  if (MODULE_FLOWS.length === 0) return null;

  if (FLOW_SELECTION_MODE === 'deterministic') {
    const flow = MODULE_FLOWS[state.nextFlowIndex % MODULE_FLOWS.length];
    state.nextFlowIndex += 1;
    return flow;
  }

  return MODULE_FLOWS[Math.floor(Math.random() * MODULE_FLOWS.length)];
}

export function handleSummary(data) {
  return { stdout: JSON.stringify(data) };
}

export default function () {
  const state = ensureState();

  if (!state.authenticated) {
    runAuth(state);
  }

  if (MODULE_FLOWS.length === 0) {
    for (const operation of AUTH_OPS) {
      executeOperation(operation, state);
    }
    return;
  }

  const flow = selectNextFlow(state);
  let sessionExpired = false;

  for (const operation of flow) {
    const outcome = executeOperation(operation, state);
    if (outcome.sessionInvalid) {
      sessionExpired = true;
      break;
    }
  }

  if (sessionExpired) {
    resetSession(state);
    runAuth(state);
  }
}
`.trim();
}
