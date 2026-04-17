import type { TestOperation } from "@/types";

/** URL base padrão do ambiente de desenvolvimento MisterT. */
export const MISTERT_DEFAULT_BASE_URL =
  "https://dev-mistert.compex.com.br";

/**
 * Metadados dos módulos de negócio selecionáveis do MisterT ERP.
 *
 * Usado pelo seletor de módulos na UI para mapear checkboxes para operações.
 * Os nomes DEVEM ser idênticos ao template principal de operações.
 */
export const MISTERT_MODULE_METADATA = [
  {
    name: "CPX-Fretes",
    code: "R=89",
    accessMode: "url-driven",
    operationNames: ["CPX-Fretes"],
  },
  {
    name: "CPX-Rastreio",
    code: "R=90",
    accessMode: "url-driven",
    operationNames: ["CPX-Rastreio"],
  },
  {
    name: "Estoque",
    code: "R=122",
    accessMode: "url-driven",
    operationNames: ["Estoque"],
  },
  {
    name: "Ordens E/S",
    code: "R=232",
    accessMode: "url-driven",
    operationNames: ["Ordens E/S"],
  },
  {
    name: "Produção",
    code: "R=169",
    accessMode: "url-driven",
    operationNames: ["Produção"],
  },
  {
    name: "Envio de GNREs",
    code: "R=18",
    accessMode: "url-driven",
    operationNames: ["Envio de GNREs"],
  },
  {
    name: "Financeiro",
    code: "R=250",
    accessMode: "url-driven",
    operationNames: ["Financeiro"],
  },
  {
    name: "Sessões Especiais",
    code: "R=865 -> POST R=2",
    accessMode: "action-driven",
    operationNames: [
      "Sessões Especiais",
      "Sessões Especiais - Inserir Novo Registro",
    ],
  },
] as const;

/**
 * Operações do fluxo principal de teste MisterT ERP.
 *
 * O MisterT usa um único entry-point (MisterT.asp) com parâmetros CTRL e R
 * dinâmicos. Nem todo CTRL extraído é reutilizável entre módulos independentes:
 * o login/menu gera um CTRL de sessão estável, enquanto algumas páginas expõem
 * CTRLs internos válidos apenas para ações do próprio formulário.
 */
export const MISTERT_OPERATIONS_TEMPLATE: readonly TestOperation[] = [
  {
    name: "Página de Login",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?MF=Y",
    method: "GET",
    captureSession: true,
    extract: { LOGIN_CTRL: "CTRL=(\\d+)" },
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
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{LOGIN_CTRL}}&R=1",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "IN1={{STRESSFLOW_USER}}&IN2={{STRESSFLOW_PASS}}",
    captureSession: true,
    extract: { SESSION_CTRL: "CTRL=(\\d+)" },
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
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{SESSION_CTRL}}&R=0",
    method: "GET",
    captureSession: true,
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
    moduleGroup: "CPX-Fretes",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{SESSION_CTRL}}&R=89",
    method: "GET",
    captureSession: true,
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
    moduleGroup: "CPX-Rastreio",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{SESSION_CTRL}}&R=90",
    method: "GET",
    captureSession: true,
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
    moduleGroup: "Estoque",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{SESSION_CTRL}}&R=122",
    method: "GET",
    captureSession: true,
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
    moduleGroup: "Ordens E/S",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{SESSION_CTRL}}&R=232",
    method: "GET",
    captureSession: true,
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
    moduleGroup: "Produção",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{SESSION_CTRL}}&R=169",
    method: "GET",
    captureSession: true,
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
    moduleGroup: "Envio de GNREs",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{SESSION_CTRL}}&R=18",
    method: "GET",
    captureSession: true,
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
    moduleGroup: "Financeiro",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{SESSION_CTRL}}&R=250",
    method: "GET",
    captureSession: true,
    navigation: {
      accessMode: "url-driven",
      notes: "Página replayable por URL dentro da sessão do mesmo VU.",
    },
    validation: {
      expectedAnyText: ["Financeiro", "Painel das Ordens"],
      rejectLoginLikeContent: true,
      rejectOnAnyText: ["Este erro nunca deve ocorrer"],
    },
  },
  {
    name: "Sessões Especiais",
    moduleGroup: "Sessões Especiais",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{SESSION_CTRL}}&R=865",
    method: "GET",
    captureSession: true,
    extract: {
      ACTION_CTRL: "action=[\"'][^\"']*CTRL=(\\d+)&R=2",
    },
    navigation: {
      accessMode: "url-driven",
      notes:
        "Página de índice/lista acessível por GET. Ela emite um novo CTRL interno para as ações do formulário.",
    },
    validation: {
      expectedAnyText: ["Pesquisar", "Insere Novo Registro"],
      rejectLoginLikeContent: true,
      rejectOnAnyText: ["Este erro nunca deve ocorrer"],
    },
  },
  {
    name: "Sessões Especiais - Inserir Novo Registro",
    moduleGroup: "Sessões Especiais",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{ACTION_CTRL}}&R=2",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "IN5=Insere+Novo+Registro",
    captureSession: true,
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
      notes:
        "A URL final não é portátil; precisa do POST do formulário da tela de Sessões Especiais.",
    },
    validation: {
      expectedAnyText: ["Sessões Especiais", "Descrição", "Usuário"],
      rejectLoginLikeContent: true,
      rejectOnAnyText: ["Este erro nunca deve ocorrer"],
    },
  },
];

/**
 * Fluxo de referência para páginas action-driven do MisterT.
 *
 * Exemplo real investigado: "Sessões Especiais -> Insere Novo Registro".
 * A URL final da tela de edição não é portátil; ela depende do POST do botão
 * "Insere Novo Registro" na tela anterior.
 */
export const MISTERT_SPECIAL_SESSIONS_TEMPLATE: readonly TestOperation[] = [
  {
    name: "Página de Login",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?MF=Y",
    method: "GET",
    captureSession: true,
    extract: { LOGIN_CTRL: "CTRL=(\\d+)" },
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
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{LOGIN_CTRL}}&R=1",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "IN1={{STRESSFLOW_USER}}&IN2={{STRESSFLOW_PASS}}",
    captureSession: true,
    extract: { SESSION_CTRL: "CTRL=(\\d+)" },
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
    moduleGroup: "Sessões Especiais",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{SESSION_CTRL}}&R=865",
    method: "GET",
    captureSession: true,
    extract: {
      ACTION_CTRL: "action=[\"'][^\"']*CTRL=(\\d+)&R=2",
    },
    navigation: {
      accessMode: "url-driven",
      notes:
        "Página de índice/lista acessível por GET. Ela emite um novo CTRL interno para as ações do formulário.",
    },
    validation: {
      expectedAnyText: ["Pesquisar", "Insere Novo Registro"],
      rejectLoginLikeContent: true,
      rejectOnAnyText: ["Este erro nunca deve ocorrer"],
    },
  },
  {
    name: "Sessões Especiais - Inserir Novo Registro",
    moduleGroup: "Sessões Especiais",
    url: "https://dev-mistert.compex.com.br/MisterT.asp?CTRL={{ACTION_CTRL}}&R=2",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "IN5=Insere+Novo+Registro",
    captureSession: true,
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
      notes:
        "A URL final não é portátil; precisa do POST do formulário da tela de Sessões Especiais.",
    },
    validation: {
      expectedAnyText: ["Sessões Especiais", "Descrição", "Usuário"],
      rejectLoginLikeContent: true,
      rejectOnAnyText: ["Este erro nunca deve ocorrer"],
    },
  },
];
