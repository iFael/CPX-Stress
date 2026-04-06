import type { TestOperation } from "@/types";

/** URL base padrão do ambiente de desenvolvimento MisterT. */
export const MISTERT_DEFAULT_BASE_URL =
  "https://dev-mistert.compex.com.br";

/**
 * Operações do fluxo de teste MisterT ERP.
 *
 * O MisterT usa um único entry-point (MisterT.asp) com parâmetros CTRL e R dinâmicos.
 * CTRL e um token de sessão gerado a cada navegação.
 *
 * Fluxo completo com Response Extraction:
 *   1. GET página de login → extrai CTRL do form action
 *   2. POST login com CTRL extraido → autentica e extrai novo CTRL
 *   3. GET módulos usando CTRL autenticado (R=número da página)
 *
 * Mapeamento de módulos: R=89 CPX-Fretes, R=90 CPX-Rastreio,
 *   R=122 Estoque, R=84 Produção, R=206 Faturamento, R=250 Financeiro,
 *   R=127 Assistencia Tecnica, R=102 Ordens E/S
 */
const MISTERT_OPERATIONS_TEMPLATE: readonly TestOperation[] = [
  {
    name: "Página de Login",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?MF=Y",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
  },
  {
    name: "Login",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=1",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "IN1={{STRESSFLOW_USER}}&IN2={{STRESSFLOW_PASS}}",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
  },
  {
    name: "Menu Principal",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=0",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
  },
  {
    name: "CPX-Fretes",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=89",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
  },
  {
    name: "CPX-Rastreio",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=90",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
  },
  {
    name: "Estoque",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=122",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
  },
  {
    name: "Ordens E/S",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=102",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
  },
  {
    name: "Produção",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=84",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
  },
  {
    name: "Faturamento",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=206",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
  },
  {
    name: "Financeiro",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=250",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
  },
];

/**
 * Metadados dos 7 módulos de negócio selecionáveis do MisterT ERP.
 *
 * Usado pelo seletor de módulos na UI para mapear checkboxes para operações.
 * Os nomes DEVEM ser idênticos a MISTERT_OPERATIONS_TEMPLATE[3..9].name —
 * a UI usa correspondência exata de string para detectar módulos no config.operations.
 * A ordem reflete a ordem de execução no template.
 */
export const MISTERT_MODULE_METADATA = [
  { name: "CPX-Fretes",   code: "R=89"  },
  { name: "CPX-Rastreio", code: "R=90"  },
  { name: "Estoque",      code: "R=122" },
  { name: "Ordens E/S",   code: "R=102" },
  { name: "Produção",     code: "R=84"  },
  { name: "Faturamento",  code: "R=206" },
  { name: "Financeiro",   code: "R=250" },
] as const;

export const MISTERT_OPERATION_COUNT = MISTERT_OPERATIONS_TEMPLATE.length;

/**
 * Retorna uma copia profunda das operações do fluxo MisterT.
 * Isso evita mutacao acidental do template compartilhado.
 *
 * @param baseUrl URL base do ambiente MisterT (sem barra final).
 *                Ex: "https://dev-mistert.compex.com.br"
 *                Quando omitido, usa MISTERT_DEFAULT_BASE_URL.
 */
export function buildMistertOperations(baseUrl?: string): TestOperation[] {
  const base = (baseUrl || MISTERT_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const defaultBase = MISTERT_DEFAULT_BASE_URL;

  return MISTERT_OPERATIONS_TEMPLATE.map((op) => ({
    ...op,
    url: op.url.replace(defaultBase, base),
    headers: op.headers ? { ...op.headers } : undefined,
  }));
}
