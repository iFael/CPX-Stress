export const MISTERT_FLOW_BODY_LIMIT_BYTES = 2_097_152;

export type ValidationDimensionStatus = "pass" | "fail" | "blocked";

export type OperationAccessMode = "url-driven" | "action-driven";

export interface OperationSourceAction {
  /**
   * Tipo de origem da navegação.
   * - direct-url: a página é acessada diretamente por URL
   * - form-submit: a página depende do submit de um formulário anterior
   */
  kind: "direct-url" | "form-submit";

  /** Método HTTP usado na ação anterior. */
  method: "GET" | "POST" | "PUT" | "DELETE";

  /** Nome do controle submit disparado no formulário anterior, quando houver. */
  submitControlName?: string;

  /** Valor esperado do controle submit anterior, quando houver. */
  submitControlValue?: string;

  /** Campos relevantes do formulário anterior que fazem parte da navegação. */
  fields?: Record<string, string>;

  /** Explicação curta da ação que leva a está página. */
  description?: string;
}

export interface OperationNavigationHints {
  /**
   * url-driven: a URL é a própria operação navegável.
   * action-driven: a URL final depende de uma ação anterior (ex: submit POST).
   */
  accessMode: OperationAccessMode;

  /** Como a navegação é produzida no passo anterior. */
  sourceAction?: OperationSourceAction;

  /** Observação curta sobre portabilidade/copiabilidade da URL. */
  notes?: string;
}

export interface OperationValidationHints {
  /**
   * Lista de textos aceitáveis. Basta um deles aparecer no HTML normalizado
   * para a validação funcional passar neste critério.
   */
  expectedAnyText?: string[];

  /**
   * Quando true, falha se o conteúdo parecer a tela de login do MisterT.
   * Default implícito do validador: true para operações autenticadas.
   */
  rejectLoginLikeContent?: boolean;

  /**
   * Lista de strings que, se encontradas no body da resposta, indicam falha
   * de sessão (ex: "Este erro nunca deve ocorrer"). Quando detectado durante
   * o stress test, o VU descarta a sessão atual e re-autentica.
   */
  rejectOnAnyText?: string[];
}

export interface OperationValidationResult {
  name: string;
  method: string;
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  cookieCount: number;
  redirectCount: number;
  redirectSuspected: boolean;
  extractedValues: Record<string, string>;
  technicalStatus: ValidationDimensionStatus;
  functionalStatus: ValidationDimensionStatus;
  technicalReasons: string[];
  functionalReasons: string[];
  blockedByOperationName?: string;
  blockedPlaceholderNames?: string[];
  loginLikeContentDetected: boolean;
  expectedTextMatches: string[];
  bodySnippet: string;
}

export interface MistertValidationSummary {
  totalOperations: number;
  technicalPassed: number;
  technicalBlocked: number;
  functionalPassed: number;
  functionalBlocked: number;
  failedOperations: string[];
  blockedOperations: string[];
}

export interface MistertValidationResult {
  startedAt: string;
  completedAt: string;
  overallTechnical: ValidationDimensionStatus;
  overallFunctional: ValidationDimensionStatus;
  canRunStressTest: boolean;
  missingEnvKeys: string[];
  operations: OperationValidationResult[];
  summary: MistertValidationSummary;
}

function decodeCommonHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function htmlToPlainText(html: string): string {
  return decodeCommonHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeValidationText(htmlOrText: string): string {
  return htmlToPlainText(htmlOrText)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function detectLoginLikeContent(htmlOrText: string): boolean {
  const normalized = normalizeValidationText(htmlOrText);
  return normalized.includes("bem vindo") &&
    normalized.includes("nome") &&
    normalized.includes("senha");
}

export function buildValidationSnippet(
  htmlOrText: string,
  maxLength: number = 220,
): string {
  const text = htmlToPlainText(htmlOrText);
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}
