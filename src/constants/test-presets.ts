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
    navigation: {
      accessMode: "url-driven",
      sourceAction: {
        kind: "direct-url",
        method: "GET",
        description: "Entry-point público do fluxo MisterT.",
      },
      notes: "Pode ser aberta diretamente por URL para iniciar a sessão.",
    },
    validation: {
      expectedAnyText: ["Nome", "Senha", "Bem vindo"],
      rejectLoginLikeContent: false,
    },
  },
  {
    name: "Login",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=1",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "IN1={{STRESSFLOW_USER}}&IN2={{STRESSFLOW_PASS}}",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
    navigation: {
      accessMode: "action-driven",
      sourceAction: {
        kind: "form-submit",
        method: "POST",
        fields: {
          IN1: "{{STRESSFLOW_USER}}",
          IN2: "{{STRESSFLOW_PASS}}",
        },
        description: "Submete o formulário de autenticação do MisterT.",
      },
      notes: "A URL sozinha não autentica; precisa do POST com credenciais.",
    },
    validation: {
      expectedAnyText: ["Novidades", "Tutorial do MisterT"],
      rejectLoginLikeContent: true,
    },
  },
  {
    name: "Menu Principal",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=0",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
    navigation: {
      accessMode: "url-driven",
      notes: "Página navegável por GET dentro da sessão autenticada.",
    },
    validation: {
      rejectLoginLikeContent: true,
    },
  },
  {
    name: "CPX-Fretes",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=89",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
    navigation: {
      accessMode: "url-driven",
      notes: "Página replayable por URL dentro da sessão do mesmo VU.",
    },
    validation: {
      expectedAnyText: ["CPX-Fretes"],
      rejectLoginLikeContent: true,
      rejectOnAnyText: ["Este erro nunca deve ocorrer"],
    },
  },
  {
    name: "CPX-Rastreio",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=90",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
    navigation: {
      accessMode: "url-driven",
      notes: "Página replayable por URL dentro da sessão do mesmo VU.",
    },
    validation: {
      expectedAnyText: ["CPX-Rastreio"],
      rejectLoginLikeContent: true,
      rejectOnAnyText: ["Este erro nunca deve ocorrer"],
    },
  },
  {
    name: "Estoque",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=122",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
    navigation: {
      accessMode: "url-driven",
      notes: "Página replayable por URL dentro da sessão do mesmo VU.",
    },
    validation: {
      expectedAnyText: ["Estoque"],
      rejectLoginLikeContent: true,
      rejectOnAnyText: ["Este erro nunca deve ocorrer"],
    },
  },
  {
    name: "Ordens E/S",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=232",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
    navigation: {
      accessMode: "url-driven",
      notes: "Página replayable por URL dentro da sessão do mesmo VU.",
    },
    validation: {
      expectedAnyText: ["Ordens", "Entrada", "Saída"],
      rejectLoginLikeContent: true,
      rejectOnAnyText: ["Este erro nunca deve ocorrer"],
    },
  },
  {
    name: "Produção",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=169",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
    navigation: {
      accessMode: "url-driven",
      notes: "Página replayable por URL dentro da sessão do mesmo VU.",
    },
    validation: {
      expectedAnyText: ["Ordens de Produ"],
      rejectLoginLikeContent: true,
      rejectOnAnyText: ["Este erro nunca deve ocorrer"],
    },
  },
  {
    name: "Envio de GNREs",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=18",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
    navigation: {
      accessMode: "url-driven",
      notes: "Página replayable por URL dentro da sessão do mesmo VU.",
    },
    validation: {
      expectedAnyText: ["Envio GNREs", "GNRE"],
      rejectLoginLikeContent: true,
      rejectOnAnyText: ["Este erro nunca deve ocorrer"],
    },
  },
  {
    name: "Financeiro",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=250",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
    navigation: {
      accessMode: "url-driven",
      notes: "Página replayable por URL dentro da sessão do mesmo VU.",
    },
    validation: {
      expectedAnyText: ["Financeiro"],
      rejectLoginLikeContent: true,
      rejectOnAnyText: ["Este erro nunca deve ocorrer"],
    },
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
  { name: "CPX-Fretes",      code: "R=89"  },
  { name: "CPX-Rastreio",    code: "R=90"  },
  { name: "Estoque",         code: "R=122" },
  { name: "Ordens E/S",      code: "R=232" },
  { name: "Produção",        code: "R=169" },
  { name: "Envio de GNREs",  code: "R=18"  },
  { name: "Financeiro",      code: "R=250" },
] as const;

export const MISTERT_OPERATION_COUNT = MISTERT_OPERATIONS_TEMPLATE.length;

/**
 * Fluxo de referência para páginas action-driven do MisterT.
 *
 * Exemplo real investigado: "Sessões Especiais -> Insere Novo Registro".
 * A URL final da tela de edição não é portátil; ela depende do POST do botão
 * "Insere Novo Registro" na tela anterior.
 */
const MISTERT_SPECIAL_SESSIONS_TEMPLATE: readonly TestOperation[] = [
  {
    name: "Página de Login",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?MF=Y",
    method: "GET",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
    navigation: {
      accessMode: "url-driven",
      sourceAction: {
        kind: "direct-url",
        method: "GET",
        description: "Entry-point público do fluxo MisterT.",
      },
      notes: "Pode ser aberta diretamente por URL para iniciar a sessão.",
    },
  },
  {
    name: "Login",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=1",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "IN1={{STRESSFLOW_USER}}&IN2={{STRESSFLOW_PASS}}",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
    navigation: {
      accessMode: "action-driven",
      sourceAction: {
        kind: "form-submit",
        method: "POST",
        fields: {
          IN1: "{{STRESSFLOW_USER}}",
          IN2: "{{STRESSFLOW_PASS}}",
        },
        description: "Submete o formulário de autenticação do MisterT.",
      },
      notes: "A URL sozinha não autentica; precisa do POST com credenciais.",
    },
  },
  {
    name: "Sessões Especiais",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=864",
    method: "GET",
    captureSession: true,
    extract: {
      CTRL: "action=[\"'][^\"']*CTRL=(\\d+)&R=2",
    },
    navigation: {
      accessMode: "url-driven",
      notes: "Página de índice/lista acessível por GET. Ela emite um novo CTRL interno para as ações do formulário.",
    },
    validation: {
      expectedAnyText: ["Pesquisar", "Insere Novo Registro"],
      rejectLoginLikeContent: true,
      rejectOnAnyText: ["Este erro nunca deve ocorrer"],
    },
  },
  {
    name: "Sessões Especiais - Inserir Novo Registro",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{CTRL}}&R=2",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "IN5=Insere+Novo+Registro",
    captureSession: true,
    extract: { CTRL: "CTRL=(\\d+)" },
    navigation: {
      accessMode: "action-driven",
      sourceAction: {
        kind: "form-submit",
        method: "POST",
        submitControlName: "IN5",
        submitControlValue: "Insere Novo Registro",
        fields: {
          IN5: "Insere Novo Registro",
        },
        description: "Submete o botão de ação que abre a tela de edição.",
      },
      notes: "A URL final não é portátil; precisa do POST do formulário da tela de Sessões Especiais.",
    },
    validation: {
      expectedAnyText: ["Sessões Especiais", "Descrição", "Usuário"],
      rejectLoginLikeContent: true,
      rejectOnAnyText: ["Este erro nunca deve ocorrer"],
    },
  },
];

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
    validation: op.validation
      ? {
          expectedAnyText: op.validation.expectedAnyText
            ? [...op.validation.expectedAnyText]
            : undefined,
          rejectLoginLikeContent: op.validation.rejectLoginLikeContent,
          rejectOnAnyText: op.validation.rejectOnAnyText
            ? [...op.validation.rejectOnAnyText]
            : undefined,
        }
      : undefined,
    navigation: op.navigation
      ? {
          accessMode: op.navigation.accessMode,
          notes: op.navigation.notes,
          sourceAction: op.navigation.sourceAction
            ? {
                kind: op.navigation.sourceAction.kind,
                method: op.navigation.sourceAction.method,
                submitControlName: op.navigation.sourceAction.submitControlName,
                submitControlValue:
                  op.navigation.sourceAction.submitControlValue,
                fields: op.navigation.sourceAction.fields
                  ? { ...op.navigation.sourceAction.fields }
                  : undefined,
                description: op.navigation.sourceAction.description,
              }
            : undefined,
        }
      : undefined,
  }));
}

/**
 * Retorna um fluxo de referência para páginas action-driven do MisterT.
 * Útil para investigações e futuros presets especializados.
 */
export function buildMistertSpecialSessionsOperations(
  baseUrl?: string,
): TestOperation[] {
  const base = (baseUrl || MISTERT_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const defaultBase = MISTERT_DEFAULT_BASE_URL;

  return MISTERT_SPECIAL_SESSIONS_TEMPLATE.map((op) => ({
    ...op,
    url: op.url.replace(defaultBase, base),
    headers: op.headers ? { ...op.headers } : undefined,
    validation: op.validation
      ? {
          expectedAnyText: op.validation.expectedAnyText
            ? [...op.validation.expectedAnyText]
            : undefined,
          rejectLoginLikeContent: op.validation.rejectLoginLikeContent,
          rejectOnAnyText: op.validation.rejectOnAnyText
            ? [...op.validation.rejectOnAnyText]
            : undefined,
        }
      : undefined,
    navigation: op.navigation
      ? {
          accessMode: op.navigation.accessMode,
          notes: op.navigation.notes,
          sourceAction: op.navigation.sourceAction
            ? {
                kind: op.navigation.sourceAction.kind,
                method: op.navigation.sourceAction.method,
                submitControlName: op.navigation.sourceAction.submitControlName,
                submitControlValue:
                  op.navigation.sourceAction.submitControlValue,
                fields: op.navigation.sourceAction.fields
                  ? { ...op.navigation.sourceAction.fields }
                  : undefined,
                description: op.navigation.sourceAction.description,
              }
            : undefined,
        }
      : undefined,
  }));
}
