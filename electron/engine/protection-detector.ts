import type { SecondMetrics } from './stress-engine'

// ============================================================================
// DETECTOR DE PROTECOES WEB
// ============================================================================
//
// Este modulo analisa as respostas HTTP coletadas durante um teste de estresse
// para identificar quais mecanismos de protecao estao ativos no alvo.
//
// -- CONCEITOS --
//
// WAF (Web Application Firewall):
//   Firewall de aplicacao web. Fica entre o usuario e o servidor, filtrando
//   requisicoes maliciosas (SQL injection, XSS, etc.). Exemplos: Cloudflare
//   WAF, AWS WAF, Imperva, Sucuri. Quando ativo, pode bloquear requests
//   legitimos durante testes de estresse com status 403 Forbidden.
//
// CDN (Content Delivery Network):
//   Rede de distribuicao de conteudo. Servidores espalhados pelo mundo que
//   armazenam copias do site para entregar mais rapido ao usuario. Exemplos:
//   Cloudflare, Akamai, CloudFront, Fastly. CDNs geralmente absorvem parte
//   da carga do teste, fazendo o servidor parecer mais resistente.
//
// Protecao DDoS (Distributed Denial of Service):
//   Sistema que detecta e bloqueia ataques de negacao de servico distribuido.
//   Quando muitas requisicoes chegam de uma vez, o sistema pode ativar modos
//   de protecao como "Under Attack Mode" (Cloudflare) ou simplesmente
//   descartar conexoes. Status 503 e comum quando isso acontece.
//
// Rate Limiting (Limitacao de Taxa):
//   Mecanismo que limita quantas requisicoes um cliente pode fazer em um
//   periodo de tempo. Exemplo: "100 requests por minuto". Quando o limite
//   e atingido, o servidor responde com status 429 (Too Many Requests) e
//   um header Retry-After indicando quando tentar novamente.
//
// Anti-Bot:
//   Sistemas que tentam distinguir humanos de bots/scripts automatizados.
//   Usam cookies especiais, fingerprinting de navegador e analise
//   comportamental. Exemplos: Akamai Bot Manager, Cloudflare Bot Management,
//   DataDome. Podem bloquear silenciosamente ou exigir desafios (challenges).
//
// CAPTCHA / Challenge:
//   Desafios visuais ou interativos que exigem intervencao humana para
//   provar que nao e um robo. Exemplos: reCAPTCHA (Google), hCaptcha,
//   Cloudflare Turnstile. Quando aparecem, o teste de estresse e
//   efetivamente bloqueado ate que o desafio seja resolvido.
//
// ============================================================================

// ---------------------------------------------------------------------------
// Tipos (espelhados do renderer para isolamento entre processos)
// ---------------------------------------------------------------------------

/**
 * Categoria do mecanismo de protecao detectado.
 *
 * - waf:             Firewall de aplicacao web (bloqueia requests maliciosos)
 * - cdn:             Rede de distribuicao de conteudo (cache e aceleracao)
 * - rate-limiter:    Limitador de taxa de requisicoes
 * - anti-bot:        Sistema de deteccao e bloqueio de bots
 * - ddos-protection: Protecao contra ataques de negacao de servico
 * - captcha:         Desafio interativo (CAPTCHA/challenge page)
 * - unknown:         Protecao identificada mas sem categoria definida
 */
type ProtectionType =
  | 'waf'
  | 'cdn'
  | 'rate-limiter'
  | 'anti-bot'
  | 'ddos-protection'
  | 'captcha'
  | 'unknown'

/**
 * Provedor/fabricante do servico de protecao detectado.
 */
type ProtectionProvider =
  | 'cloudflare'
  | 'akamai'
  | 'fastly'
  | 'imperva'
  | 'sucuri'
  | 'aws-waf'
  | 'aws-cloudfront'
  | 'azure-frontdoor'
  | 'google-cloud-armor'
  | 'ddos-guard'
  | 'stackpath'
  | 'varnish'
  | 'nginx'
  | 'custom'
  | 'unknown'

/** Nivel qualitativo de confianca da deteccao. */
type ConfidenceLevel = 'high' | 'medium' | 'low'

/** Uma evidencia individual que levou a deteccao de uma protecao. */
interface ProtectionIndicator {
  source: 'header' | 'cookie' | 'status-code' | 'body' | 'behavior' | 'timing'
  name: string
  value: string
  detail: string
}

/** Resultado consolidado da deteccao de um tipo de protecao de um provedor. */
interface ProtectionDetection {
  type: ProtectionType
  provider: ProtectionProvider
  confidence: number
  confidenceLevel: ConfidenceLevel
  indicators: ProtectionIndicator[]
  description: string
}

/** Informacoes sobre rate limiting detectado durante o teste. */
interface RateLimitInfo {
  detected: boolean
  triggerPoint?: number
  limitPerWindow?: string
  windowSeconds?: number
  recoveryPattern?: string
}

/** Padrao comportamental observado na timeline do teste. */
interface BehavioralPattern {
  type: 'throttling' | 'blocking' | 'challenge' | 'degradation' | 'normal'
  description: string
  startSecond?: number
  evidence: string
}

/** Relatorio completo gerado apos a analise de protecoes. */
interface ProtectionReport {
  detections: ProtectionDetection[]
  rateLimitInfo: RateLimitInfo
  behavioralPatterns: BehavioralPattern[]
  overallRisk: 'none' | 'low' | 'medium' | 'high' | 'critical'
  summary: string
  analysisTimestamp: string
}

/** Dados de amostra capturados de uma resposta HTTP individual. */
export interface ResponseSample {
  statusCode: number
  headers: Record<string, string>
  cookies: string[]
  bodySnippet: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Base de assinaturas - Headers HTTP
// ---------------------------------------------------------------------------
//
// Cada entrada mapeia um header HTTP para um provedor/tipo de protecao.
// O campo `pattern` pode ser uma RegExp ou string para matching.
// O campo `confidence` vai de 0 a 100 indicando a certeza da deteccao.
// ---------------------------------------------------------------------------

interface HeaderSignature {
  header: string
  pattern: RegExp | string
  provider: ProtectionProvider
  type: ProtectionType
  confidence: number
  detail: string
}

const HEADER_SIGNATURES: HeaderSignature[] = [

  // --- Cloudflare ---
  // CDN e WAF muito popular. Adiciona headers "cf-*" em todas as respostas.
  // O "cf-ray" e um identificador unico por request, praticamente confirma Cloudflare.
  { header: 'cf-ray',          pattern: /.+/,            provider: 'cloudflare', type: 'cdn',             confidence: 95, detail: 'Cloudflare Ray ID detectado' },
  { header: 'cf-cache-status', pattern: /.+/,            provider: 'cloudflare', type: 'cdn',             confidence: 90, detail: 'Cloudflare cache ativo' },
  { header: 'cf-mitigated',    pattern: /.+/,            provider: 'cloudflare', type: 'ddos-protection', confidence: 95, detail: 'Mitigacao Cloudflare ativa' },
  { header: 'server',          pattern: /cloudflare/i,   provider: 'cloudflare', type: 'waf',             confidence: 90, detail: 'Servidor Cloudflare identificado' },
  { header: 'cf-connecting-ip', pattern: /.+/,           provider: 'cloudflare', type: 'cdn',             confidence: 80, detail: 'Proxy Cloudflare detectado' },

  // --- Akamai ---
  // Uma das maiores CDNs do mundo. Muito usada por grandes empresas.
  // Headers "x-akamai-*" identificam requests processados pela rede Akamai.
  { header: 'x-akamai-transformed',  pattern: /.+/,                      provider: 'akamai', type: 'cdn',      confidence: 95, detail: 'Transformacao Akamai detectada' },
  { header: 'x-akamai-request-id',   pattern: /.+/,                      provider: 'akamai', type: 'cdn',      confidence: 95, detail: 'Request ID Akamai' },
  { header: 'akamai-grn',            pattern: /.+/,                      provider: 'akamai', type: 'cdn',      confidence: 90, detail: 'Akamai GRN detectado' },
  { header: 'server',                pattern: /akamaighost|akamainetwork/i, provider: 'akamai', type: 'cdn',   confidence: 90, detail: 'Servidor Akamai identificado' },
  { header: 'x-akamai-session-info', pattern: /.+/,                      provider: 'akamai', type: 'anti-bot', confidence: 85, detail: 'Sessao anti-bot Akamai' },

  // --- Fastly ---
  // CDN focada em performance. Usa Varnish por baixo, entao o header "via"
  // com "varnish" pode indicar Fastly (mas tambem Varnish standalone).
  { header: 'x-served-by',        pattern: /cache-/i, provider: 'fastly', type: 'cdn', confidence: 85, detail: 'Fastly cache edge detectado' },
  { header: 'x-fastly-request-id', pattern: /.+/,     provider: 'fastly', type: 'cdn', confidence: 95, detail: 'Fastly request ID' },
  { header: 'fastly-io-info',     pattern: /.+/,      provider: 'fastly', type: 'cdn', confidence: 90, detail: 'Fastly IO Info' },
  { header: 'via',                pattern: /varnish/i, provider: 'fastly', type: 'cdn', confidence: 70, detail: 'Varnish via Fastly' },

  // --- Imperva / Incapsula ---
  // WAF empresarial. O header "x-iinfo" e tipico do Incapsula (agora Imperva).
  { header: 'x-iinfo', pattern: /.+/,                  provider: 'imperva', type: 'waf', confidence: 90, detail: 'Imperva Incapsula detectado' },
  { header: 'x-cdn',   pattern: /incapsula|imperva/i,  provider: 'imperva', type: 'waf', confidence: 95, detail: 'Imperva CDN header' },

  // --- Sucuri ---
  // WAF e CDN voltado para WordPress e sites menores.
  { header: 'x-sucuri-id',    pattern: /.+/,        provider: 'sucuri', type: 'waf', confidence: 95, detail: 'Sucuri WAF detectado' },
  { header: 'server',         pattern: /sucuri/i,    provider: 'sucuri', type: 'waf', confidence: 90, detail: 'Servidor Sucuri identificado' },
  { header: 'x-sucuri-cache', pattern: /.+/,         provider: 'sucuri', type: 'cdn', confidence: 85, detail: 'Sucuri cache ativo' },

  // --- AWS (Amazon Web Services) ---
  // CloudFront e a CDN da Amazon. O WAF da AWS pode ser usado junto.
  // Headers "x-amz-*" indicam infraestrutura AWS.
  { header: 'x-amzn-requestid', pattern: /.+/,                   provider: 'aws-waf',        type: 'waf', confidence: 70, detail: 'AWS request ID (possivel WAF)' },
  { header: 'x-amz-cf-id',      pattern: /.+/,                   provider: 'aws-cloudfront',  type: 'cdn', confidence: 90, detail: 'CloudFront distribution ID' },
  { header: 'x-amz-cf-pop',     pattern: /.+/,                   provider: 'aws-cloudfront',  type: 'cdn', confidence: 90, detail: 'CloudFront POP edge' },
  { header: 'server',           pattern: /amazons3|cloudfront/i, provider: 'aws-cloudfront',  type: 'cdn', confidence: 85, detail: 'AWS CloudFront detectado' },

  // --- Azure Front Door ---
  // CDN e balanceador de carga da Microsoft Azure.
  { header: 'x-azure-ref',      pattern: /.+/, provider: 'azure-frontdoor', type: 'cdn', confidence: 90, detail: 'Azure Front Door detectado' },
  { header: 'x-fd-healthprobe', pattern: /.+/, provider: 'azure-frontdoor', type: 'cdn', confidence: 85, detail: 'Azure Front Door health' },

  // --- Google Cloud Armor ---
  // WAF e protecao DDoS do Google Cloud Platform.
  { header: 'x-goog-request-params', pattern: /.+/,           provider: 'google-cloud-armor', type: 'waf', confidence: 70, detail: 'Google Cloud request params' },
  { header: 'server',               pattern: /gws|google/i,  provider: 'google-cloud-armor', type: 'cdn', confidence: 60, detail: 'Servidor Google detectado' },

  // --- DDoS-Guard ---
  // Servico russo de protecao DDoS. Identificavel pelo header "server".
  { header: 'server', pattern: /ddos-guard/i, provider: 'ddos-guard', type: 'ddos-protection', confidence: 95, detail: 'DDoS-Guard server detectado' },

  // --- StackPath ---
  // CDN com protecao WAF integrada.
  { header: 'x-sp-url', pattern: /.+/, provider: 'stackpath', type: 'cdn', confidence: 85, detail: 'StackPath CDN detectado' },

  // --- Varnish (standalone) ---
  // Cache HTTP de alta performance. Quando aparece sozinho (sem Fastly),
  // indica um proxy/cache na frente do servidor de origem.
  { header: 'x-varnish', pattern: /.+/,      provider: 'varnish', type: 'cdn', confidence: 80, detail: 'Varnish cache detectado' },
  { header: 'via',        pattern: /varnish/i, provider: 'varnish', type: 'cdn', confidence: 75, detail: 'Varnish proxy via header' },

  // --- Nginx ---
  // Servidor web muito usado como reverse proxy. Pode ter modulo de rate
  // limiting (ngx_http_limit_req_module), mas sozinho nao confirma protecao.
  { header: 'server', pattern: /^nginx/i, provider: 'nginx', type: 'waf', confidence: 40, detail: 'Nginx server (possivel rate limiter)' },

  // --- Rate Limiting generico ---
  // Headers padronizados (RFC 6585 / draft-ietf-httpapi-ratelimit-headers)
  // que qualquer servidor pode usar para comunicar limites de taxa.
  // "x-ratelimit-limit":     quantas requests sao permitidas na janela
  // "x-ratelimit-remaining": quantas requests restam na janela atual
  // "x-ratelimit-reset":     timestamp de quando a janela reseta
  // "retry-after":           segundos ate poder tentar novamente (RFC 7231)
  { header: 'x-ratelimit-limit',     pattern: /.+/, provider: 'unknown', type: 'rate-limiter', confidence: 95, detail: 'Rate limit header presente' },
  { header: 'x-ratelimit-remaining', pattern: /.+/, provider: 'unknown', type: 'rate-limiter', confidence: 95, detail: 'Rate limit remaining' },
  { header: 'x-ratelimit-reset',     pattern: /.+/, provider: 'unknown', type: 'rate-limiter', confidence: 90, detail: 'Rate limit reset timer' },
  { header: 'retry-after',           pattern: /.+/, provider: 'unknown', type: 'rate-limiter', confidence: 85, detail: 'Retry-After header presente' },
  { header: 'x-rate-limit-limit',    pattern: /.+/, provider: 'unknown', type: 'rate-limiter', confidence: 90, detail: 'Rate limit (formato alternativo)' },
]

// ---------------------------------------------------------------------------
// Base de assinaturas - Cookies
// ---------------------------------------------------------------------------
//
// Muitos servicos de protecao plantam cookies especificos no navegador para
// rastrear sessoes, gerenciar challenges e identificar bots. O nome do cookie
// geralmente segue um padrao unico do provedor.
// ---------------------------------------------------------------------------

interface CookieSignature {
  pattern: RegExp
  provider: ProtectionProvider
  type: ProtectionType
  confidence: number
  detail: string
}

const COOKIE_SIGNATURES: CookieSignature[] = [

  // --- Cloudflare ---
  // "__cf_bm": Bot Management - identifica e classifica bots
  // "cf_clearance": plantado apos o usuario passar por um challenge (CAPTCHA)
  { pattern: /^__cf_bm=/,       provider: 'cloudflare', type: 'anti-bot',        confidence: 90, detail: 'Cloudflare Bot Management cookie' },
  { pattern: /^cf_clearance=/,  provider: 'cloudflare', type: 'captcha',          confidence: 85, detail: 'Cloudflare clearance (pos-challenge)' },
  { pattern: /^__cfduid=/,      provider: 'cloudflare', type: 'cdn',              confidence: 80, detail: 'Cloudflare identificador' },
  { pattern: /^cf_ob_info=/,    provider: 'cloudflare', type: 'ddos-protection',  confidence: 80, detail: 'Cloudflare Always Online cookie' },
  { pattern: /^_cf_/,           provider: 'cloudflare', type: 'waf',              confidence: 75, detail: 'Cookie Cloudflare generico' },

  // --- Akamai ---
  // "ak_bmsc": Bot Manager Score Cookie - classifica o risco do visitante
  // "_abck": cookie anti-bot principal do Akamai Bot Manager
  { pattern: /^ak_bmsc=/,  provider: 'akamai', type: 'anti-bot', confidence: 90, detail: 'Akamai Bot Manager cookie' },
  { pattern: /^bm_sv=/,    provider: 'akamai', type: 'anti-bot', confidence: 85, detail: 'Akamai Bot Manager session' },
  { pattern: /^bm_mi=/,    provider: 'akamai', type: 'anti-bot', confidence: 85, detail: 'Akamai Bot Manager ID' },
  { pattern: /^_abck=/,    provider: 'akamai', type: 'anti-bot', confidence: 90, detail: 'Akamai anti-bot cookie (_abck)' },

  // --- Imperva / Incapsula ---
  // "visid_incap_*": visitor ID unico por site protegido
  // "reese84": cookie do Advanced Bot Protection (deteccao avancada de bots)
  { pattern: /^visid_incap_/, provider: 'imperva', type: 'waf',      confidence: 90, detail: 'Imperva Incapsula visitor ID' },
  { pattern: /^incap_ses_/,  provider: 'imperva', type: 'waf',      confidence: 90, detail: 'Imperva Incapsula session' },
  { pattern: /^reese84=/,    provider: 'imperva', type: 'anti-bot', confidence: 85, detail: 'Imperva Advanced Bot Protection' },

  // --- Sucuri ---
  { pattern: /^sucuri_cloudproxy_/, provider: 'sucuri', type: 'waf', confidence: 90, detail: 'Sucuri cloud proxy cookie' },

  // --- Outros provedores ---
  { pattern: /^datadome=/, provider: 'custom',     type: 'anti-bot',        confidence: 90, detail: 'DataDome anti-bot cookie' },
  { pattern: /^__ddg/,     provider: 'ddos-guard', type: 'ddos-protection', confidence: 85, detail: 'DDoS-Guard cookie' },
]

// ---------------------------------------------------------------------------
// Base de assinaturas - Conteudo do Body (HTML)
// ---------------------------------------------------------------------------
//
// Quando um WAF ou protecao DDoS bloqueia uma requisicao, geralmente retorna
// uma pagina HTML propria com mensagens de erro ou challenges. Esses padroes
// no corpo da resposta ajudam a identificar qual protecao esta ativa.
// ---------------------------------------------------------------------------

interface BodySignature {
  pattern: RegExp
  provider: ProtectionProvider
  type: ProtectionType
  confidence: number
  detail: string
}

const BODY_SIGNATURES: BodySignature[] = [

  // --- Cloudflare ---
  // "Checking your browser" = modo Under Attack ativo (JavaScript challenge)
  // "Attention Required" = pagina de bloqueio do WAF
  { pattern: /cf-browser-verification|cf-challenge|cf\.challenge/i,  provider: 'cloudflare', type: 'captcha',          confidence: 90, detail: 'Cloudflare challenge page detectada' },
  { pattern: /attention required.*cloudflare/i,                      provider: 'cloudflare', type: 'waf',              confidence: 85, detail: 'Cloudflare WAF block page' },
  { pattern: /checking your browser.*cloudflare/i,                   provider: 'cloudflare', type: 'anti-bot',         confidence: 90, detail: 'Cloudflare Under Attack Mode' },
  { pattern: /ray id:/i,                                             provider: 'cloudflare', type: 'waf',              confidence: 70, detail: 'Cloudflare Ray ID na pagina de erro' },

  // --- Imperva / Incapsula ---
  { pattern: /access denied.*incapsula/i,  provider: 'imperva', type: 'waf', confidence: 90, detail: 'Imperva block page' },
  { pattern: /incident id.*incapsula/i,    provider: 'imperva', type: 'waf', confidence: 85, detail: 'Imperva incident ID' },

  // --- Sucuri ---
  { pattern: /sucuri website firewall/i, provider: 'sucuri', type: 'waf', confidence: 95, detail: 'Sucuri WAF block page' },
  { pattern: /access denied.*sucuri/i,   provider: 'sucuri', type: 'waf', confidence: 90, detail: 'Sucuri access denied' },

  // --- Akamai ---
  { pattern: /akamai.*access denied|ghost.*access denied/i, provider: 'akamai', type: 'waf', confidence: 80, detail: 'Akamai block page' },

  // --- DDoS-Guard ---
  { pattern: /ddos-guard/i, provider: 'ddos-guard', type: 'ddos-protection', confidence: 90, detail: 'DDoS-Guard block page' },

  // --- Generico ---
  // CAPTCHAs de terceiros (podem aparecer em qualquer provedor)
  { pattern: /captcha|recaptcha|hcaptcha|turnstile/i,     provider: 'unknown', type: 'captcha',      confidence: 80, detail: 'CAPTCHA detectado na resposta' },
  { pattern: /<title>.*403.*forbidden.*<\/title>/i,        provider: 'unknown', type: 'waf',          confidence: 60, detail: 'Pagina 403 Forbidden (possivel WAF)' },
  { pattern: /rate limit|too many requests/i,              provider: 'unknown', type: 'rate-limiter', confidence: 75, detail: 'Mensagem de rate limit no body' },
]

// ---------------------------------------------------------------------------
// Mapeamentos de nomes legiveis para exibicao no relatorio
// ---------------------------------------------------------------------------

/** Nomes de exibicao para cada provedor de protecao. */
const PROVIDER_DISPLAY_NAMES: Readonly<Record<ProtectionProvider, string>> = {
  'cloudflare':         'Cloudflare',
  'akamai':             'Akamai',
  'fastly':             'Fastly',
  'imperva':            'Imperva/Incapsula',
  'sucuri':             'Sucuri',
  'aws-waf':            'AWS WAF',
  'aws-cloudfront':     'AWS CloudFront',
  'azure-frontdoor':    'Azure Front Door',
  'google-cloud-armor': 'Google Cloud Armor',
  'ddos-guard':         'DDoS-Guard',
  'stackpath':          'StackPath',
  'varnish':            'Varnish Cache',
  'nginx':              'Nginx',
  'custom':             'Solucao customizada',
  'unknown':            'Provedor desconhecido',
}

/** Labels legiveis para cada tipo de protecao. */
const PROTECTION_TYPE_LABELS: Readonly<Record<ProtectionType, string>> = {
  'waf':              'WAF (Web Application Firewall)',
  'cdn':              'CDN (Content Delivery Network)',
  'rate-limiter':     'Rate Limiting',
  'anti-bot':         'Protecao Anti-Bot',
  'ddos-protection':  'Protecao DDoS',
  'captcha':          'CAPTCHA/Challenge',
  'unknown':          'Protecao desconhecida',
}

/** Labels curtos para o resumo (sem siglas entre parenteses). */
const PROTECTION_TYPE_SHORT_LABELS: Readonly<Record<ProtectionType, string>> = {
  'waf':              'WAF',
  'cdn':              'CDN',
  'rate-limiter':     'Rate Limiting',
  'anti-bot':         'Anti-Bot',
  'ddos-protection':  'DDoS Protection',
  'captcha':          'CAPTCHA/Challenge',
  'unknown':          'Protecao desconhecida',
}

// ---------------------------------------------------------------------------
// Constantes de configuracao
// ---------------------------------------------------------------------------

/** Intervalo minimo entre coletas de amostra (em milissegundos). */
const SAMPLE_INTERVAL_MS = 2000

/** Numero maximo de amostras armazenadas para analise. */
const MAX_SAMPLES = 50

/** Confianca maxima permitida (nunca atingimos 100% para evitar falsos absolutos). */
const MAX_CONFIDENCE = 99

/** Minimo de pontos na timeline para analise comportamental. */
const MIN_TIMELINE_POINTS = 3

/** Amostras iniciais coletadas sem restricao de intervalo. */
const INITIAL_UNRESTRICTED_SAMPLES = 2

// ---------------------------------------------------------------------------
// Limiares para deteccao comportamental
// ---------------------------------------------------------------------------

/** Fator minimo de aumento de latencia para considerar throttling (3x = 300%). */
const THROTTLING_LATENCY_FACTOR = 3

/** Taxa de erro (%) acima da qual consideramos bloqueio. */
const BLOCKING_ERROR_THRESHOLD = 50

/** Taxa de erro (%) abaixo da qual o segundo anterior e considerado "normal". */
const BLOCKING_NORMAL_THRESHOLD = 20

/** Fracao de respostas 403/503 para considerar challenge pages (30%). */
const CHALLENGE_RATIO_THRESHOLD = 0.3

/** Fator de queda de RPS para considerar degradacao (queda de 60%). */
const DEGRADATION_RPS_FACTOR = 0.4

// ---------------------------------------------------------------------------
// Limiares para calculo de risco geral
// ---------------------------------------------------------------------------

/** Pesos de risco por tipo de protecao (multiplicam a confianca). */
const RISK_WEIGHTS: Readonly<Record<ProtectionType, number>> = {
  'waf':              0.8,
  'cdn':              0.2,
  'rate-limiter':     0.7,
  'anti-bot':         0.9,
  'ddos-protection':  0.8,
  'captcha':          0.9,
  'unknown':          0.3,
}

/** Pontos de risco adicionados por padrao comportamental. */
const BEHAVIORAL_RISK_POINTS: Readonly<Record<BehavioralPattern['type'], number>> = {
  'blocking':     80,
  'throttling':   40,
  'challenge':    60,
  'degradation':  30,
  'normal':        0,
}

/** Pontos de risco adicionados quando rate limiting e detectado. */
const RATE_LIMIT_RISK_POINTS = 50

/** Limiares para classificacao de risco geral. */
const RISK_THRESHOLDS = {
  critical: 200,
  high:     120,
  medium:    60,
} as const

// ============================================================================
// Classe principal - ProtectionDetector
// ============================================================================

/**
 * Analisa respostas HTTP coletadas durante testes de estresse para detectar
 * mecanismos de protecao (WAF, CDN, rate limiting, anti-bot, etc.).
 *
 * Funcionamento:
 * 1. Durante o teste, o stress engine chama `collectSample()` com amostras
 *    de respostas HTTP (headers, cookies, status code, body snippet).
 * 2. Apos o teste, `analyze()` processa todas as amostras coletadas contra
 *    as bases de assinaturas e gera um relatorio completo.
 *
 * Complexidade: O(amostras x assinaturas) -- limitado por MAX_SAMPLES.
 */
export class ProtectionDetector {
  private collectedSamples: ResponseSample[] = []
  private lastCollectionTimestamp = 0
  private collectedSampleCount = 0
  private timelineReference: SecondMetrics[] = []

  // -------------------------------------------------------------------------
  // API publica
  // -------------------------------------------------------------------------

  /**
   * Registra uma amostra de resposta HTTP para analise posterior.
   *
   * Chamado pelo stress engine para um subconjunto de requests (amostragem).
   * As primeiras amostras sao coletadas imediatamente; apos isso, respeita
   * o intervalo minimo de SAMPLE_INTERVAL_MS para evitar excesso de dados.
   */
  collectSample(sample: ResponseSample): void {
    if (this.collectedSamples.length >= MAX_SAMPLES) return

    const now = Date.now()
    const isAfterInitialPhase = this.collectedSampleCount > INITIAL_UNRESTRICTED_SAMPLES
    const isTooSoon = (now - this.lastCollectionTimestamp) < SAMPLE_INTERVAL_MS

    if (isAfterInitialPhase && isTooSoon) return

    this.collectedSamples.push(sample)
    this.lastCollectionTimestamp = now
    this.collectedSampleCount++
  }

  /** Vincula a timeline do teste para analise de padroes comportamentais. */
  setTimeline(timeline: SecondMetrics[]): void {
    this.timelineReference = timeline
  }

  /**
   * Gera o relatorio final de protecoes detectadas.
   *
   * Deve ser chamado apos o teste finalizar. Analisa todas as amostras
   * coletadas contra as bases de assinaturas (headers, cookies, body,
   * status codes) e tambem avalia padroes comportamentais na timeline.
   */
  analyze(): ProtectionReport {
    const detectionMap = new Map<string, ProtectionDetection>()

    // Fase 1: Analisar cada amostra contra as bases de assinaturas
    for (const sample of this.collectedSamples) {
      this.detectFromHeaders(sample, detectionMap)
      this.detectFromCookies(sample, detectionMap)
      this.detectFromBody(sample, detectionMap)
      this.detectFromStatusCode(sample, detectionMap)
    }

    // Fase 2: Analisar padroes de rate limiting e comportamentais na timeline
    const rateLimitInfo = this.extractRateLimitInfo()
    const behavioralPatterns = this.detectBehavioralPatterns()

    // Fase 3: Converter padroes comportamentais anomalos em deteccoes
    this.addBehavioralDetections(behavioralPatterns, detectionMap)

    // Fase 4: Consolidar e ordenar resultados por confianca (mais confiante primeiro)
    const detections = Array.from(detectionMap.values())
      .sort((a, b) => b.confidence - a.confidence)

    const overallRisk = this.calculateOverallRisk(detections, rateLimitInfo, behavioralPatterns)
    const summary = this.generateSummary(detections, rateLimitInfo, behavioralPatterns)

    return {
      detections,
      rateLimitInfo,
      behavioralPatterns,
      overallRisk,
      summary,
      analysisTimestamp: new Date().toISOString(),
    }
  }

  /** Reseta o estado interno para reutilizacao entre testes. */
  reset(): void {
    this.collectedSamples = []
    this.lastCollectionTimestamp = 0
    this.collectedSampleCount = 0
    this.timelineReference = []
  }

  // -------------------------------------------------------------------------
  // Deteccao por assinaturas
  // -------------------------------------------------------------------------

  /**
   * Analisa os headers HTTP de uma amostra contra a base de assinaturas.
   * Cada header e comparado com todos os padroes conhecidos.
   */
  private detectFromHeaders(sample: ResponseSample, detectionMap: Map<string, ProtectionDetection>): void {
    for (const signature of HEADER_SIGNATURES) {
      const headerValue = sample.headers[signature.header.toLowerCase()]
      if (!headerValue) continue

      const matchesPattern = typeof signature.pattern === 'string'
        ? headerValue.toLowerCase().includes(signature.pattern.toLowerCase())
        : signature.pattern.test(headerValue)

      if (!matchesPattern) continue

      const indicator: ProtectionIndicator = {
        source: 'header',
        name: signature.header,
        value: headerValue,
        detail: signature.detail,
      }

      this.upsertDetection(detectionMap, {
        key: `${signature.provider}_${signature.type}`,
        type: signature.type,
        provider: signature.provider,
        confidence: signature.confidence,
        indicator,
        description: this.buildProviderDescription(signature.provider, signature.type),
      })
    }
  }

  /**
   * Analisa os cookies de uma amostra contra a base de assinaturas.
   * Cookies sao verificados pelo nome (prefixo antes do "=").
   */
  private detectFromCookies(sample: ResponseSample, detectionMap: Map<string, ProtectionDetection>): void {
    for (const cookie of sample.cookies) {
      for (const signature of COOKIE_SIGNATURES) {
        if (!signature.pattern.test(cookie)) continue

        const cookieName = cookie.split('=')[0] || cookie

        const indicator: ProtectionIndicator = {
          source: 'cookie',
          name: cookieName,
          value: cookie.substring(0, 80),
          detail: signature.detail,
        }

        this.upsertDetection(detectionMap, {
          key: `${signature.provider}_${signature.type}`,
          type: signature.type,
          provider: signature.provider,
          confidence: signature.confidence,
          indicator,
          description: this.buildProviderDescription(signature.provider, signature.type),
        })
      }
    }
  }

  /**
   * Analisa o snippet do body HTML contra padroes conhecidos de paginas
   * de bloqueio, challenge e erro de WAFs e protecoes DDoS.
   */
  private detectFromBody(sample: ResponseSample, detectionMap: Map<string, ProtectionDetection>): void {
    if (!sample.bodySnippet) return

    for (const signature of BODY_SIGNATURES) {
      if (!signature.pattern.test(sample.bodySnippet)) continue

      // Body usa chave separada para nao colidir com deteccoes por header/cookie
      const key = `${signature.provider}_${signature.type}_body`
      const existing = detectionMap.get(key)

      if (existing) {
        existing.confidence = Math.min(MAX_CONFIDENCE, Math.max(existing.confidence, signature.confidence))
        existing.confidenceLevel = this.resolveConfidenceLevel(existing.confidence)
        continue
      }

      const indicator: ProtectionIndicator = {
        source: 'body',
        name: 'response-body',
        value: sample.bodySnippet.substring(0, 120),
        detail: signature.detail,
      }

      detectionMap.set(key, {
        type: signature.type,
        provider: signature.provider,
        confidence: signature.confidence,
        confidenceLevel: this.resolveConfidenceLevel(signature.confidence),
        indicators: [indicator],
        description: signature.detail,
      })
    }
  }

  /**
   * Analisa o status code HTTP da amostra.
   *
   * Codigos relevantes:
   * - 403 (Forbidden): possivel bloqueio por WAF
   * - 429 (Too Many Requests): rate limiting confirmado
   * - 503 (Service Unavailable): possivel protecao DDoS ou sobrecarga
   */
  private detectFromStatusCode(sample: ResponseSample, detectionMap: Map<string, ProtectionDetection>): void {
    const statusCode = sample.statusCode

    const statusSignatures: Array<{
      code: number
      key: string
      type: ProtectionType
      confidence: number
      statusLabel: string
      detail: string
      description: string
    }> = [
      {
        code: 403,
        key: 'statuscode_waf',
        type: 'waf',
        confidence: 50,
        statusLabel: 'Forbidden',
        detail: 'Status 403 pode indicar WAF bloqueando requests',
        description: 'Status HTTP 403 detectado -- possivel bloqueio por WAF',
      },
      {
        code: 429,
        key: 'statuscode_ratelimit',
        type: 'rate-limiter',
        confidence: 95,
        statusLabel: 'Too Many Requests',
        detail: 'Rate limiting ativo -- servidor rejeitando requests excedentes',
        description: 'Rate limiting detectado via HTTP 429',
      },
      {
        code: 503,
        key: 'statuscode_ddos',
        type: 'ddos-protection',
        confidence: 45,
        statusLabel: 'Service Unavailable',
        detail: 'Status 503 pode indicar protecao DDoS ativa ou servidor sobrecarregado',
        description: 'Status 503 detectado -- possivel protecao DDoS ou sobrecarga',
      },
    ]

    for (const sig of statusSignatures) {
      if (statusCode !== sig.code) continue
      if (detectionMap.has(sig.key)) continue

      detectionMap.set(sig.key, {
        type: sig.type,
        provider: 'unknown',
        confidence: sig.confidence,
        confidenceLevel: this.resolveConfidenceLevel(sig.confidence),
        indicators: [{
          source: 'status-code',
          name: String(sig.code),
          value: sig.statusLabel,
          detail: sig.detail,
        }],
        description: sig.description,
      })
    }
  }

  // -------------------------------------------------------------------------
  // Analise de rate limiting
  // -------------------------------------------------------------------------

  /**
   * Extrai informacoes de rate limiting a partir dos headers das amostras
   * e dos padroes de status code na timeline.
   *
   * Verifica:
   * - Headers padrao de rate limit (x-ratelimit-*, retry-after)
   * - Presenca de status 429 nas amostras
   * - Ponto na timeline onde os 429s comecaram
   * - Padrao de recuperacao (se os erros diminuem apos o pico)
   */
  private extractRateLimitInfo(): RateLimitInfo {
    let limitPerWindow: string | undefined
    let windowSeconds: number | undefined

    // Buscar headers de rate limit nas amostras coletadas
    for (const sample of this.collectedSamples) {
      const limitHeader = sample.headers['x-ratelimit-limit'] || sample.headers['x-rate-limit-limit']
      const resetHeader = sample.headers['x-ratelimit-reset'] || sample.headers['retry-after']

      if (limitHeader) limitPerWindow = limitHeader

      if (resetHeader) {
        const resetValue = Number(resetHeader)
        if (!isNaN(resetValue) && resetValue > 0) {
          // Se o valor e um timestamp Unix (> 1 bilhao), calcular diferenca
          // Se e um numero simples, tratar como segundos diretamente
          const isUnixTimestamp = resetValue > 1e9
          windowSeconds = isUnixTimestamp
            ? Math.floor(resetValue - Date.now() / 1000)
            : resetValue
        }
      }
    }

    // Verificar se alguma amostra recebeu status 429
    const hasStatus429 = this.collectedSamples.some(s => s.statusCode === 429)

    // Analisar timeline para encontrar quando os 429s comecaram
    const triggerPoint = this.findRateLimitTriggerSecond()
    const recoveryPattern = this.detectRecoveryPattern()

    return {
      detected: hasStatus429 || !!limitPerWindow,
      triggerPoint,
      limitPerWindow,
      windowSeconds,
      recoveryPattern,
    }
  }

  /**
   * Encontra o segundo exato na timeline onde respostas 429 comecaram.
   * Retorna undefined se nao houver 429s na timeline.
   */
  private findRateLimitTriggerSecond(): number | undefined {
    for (const second of this.timelineReference) {
      if (second.statusCodes['429'] && second.statusCodes['429'] > 0) {
        return second.second
      }
    }
    return undefined
  }

  /**
   * Analisa se o servidor se recupera apos o pico de erros.
   *
   * "Parcialmente recuperavel" = taxa de erro diminui apos o pico
   * "Sem recuperacao" = bloqueio persiste ate o fim do teste
   */
  private detectRecoveryPattern(): string | undefined {
    const timeline = this.timelineReference
    if (timeline.length <= 2) return undefined

    const errorRates = timeline.map(s => s.requests > 0 ? s.errors / s.requests : 0)
    const peakIndex = errorRates.indexOf(Math.max(...errorRates))

    if (peakIndex <= 0 || peakIndex >= errorRates.length - 1) return undefined

    const ratesAfterPeak = errorRates.slice(peakIndex + 1)
    if (ratesAfterPeak.length < 2) return undefined

    const isRecovering = ratesAfterPeak[ratesAfterPeak.length - 1] < ratesAfterPeak[0]

    return isRecovering
      ? 'Parcialmente recuperavel -- taxa de erro diminui apos pico'
      : 'Sem recuperacao -- bloqueio persistente'
  }

  // -------------------------------------------------------------------------
  // Analise comportamental
  // -------------------------------------------------------------------------

  /**
   * Analisa a timeline do teste para detectar padroes comportamentais
   * que indicam protecoes ativas, mesmo sem assinaturas explicitas.
   *
   * Padroes detectados:
   * - Throttling: latencia cresce progressivamente (servidor desacelerando)
   * - Blocking: taxa de erro salta abruptamente (bloqueio ativado)
   * - Challenge: grande fracao de respostas 403/503 (paginas de challenge)
   * - Degradation: throughput (RPS) cai significativamente ao longo do teste
   */
  private detectBehavioralPatterns(): BehavioralPattern[] {
    const timeline = this.timelineReference
    const patterns: BehavioralPattern[] = []

    if (timeline.length < MIN_TIMELINE_POINTS) {
      patterns.push({
        type: 'normal',
        description: 'Dados insuficientes para analise comportamental',
        evidence: `Timeline < ${MIN_TIMELINE_POINTS} segundos`,
      })
      return patterns
    }

    // Verificar cada tipo de padrao anomalo
    const throttling = this.detectThrottling(timeline)
    if (throttling) patterns.push(throttling)

    const blocking = this.detectBlocking(timeline)
    if (blocking) patterns.push(blocking)

    const challenge = this.detectChallenge(timeline)
    if (challenge) patterns.push(challenge)

    const degradation = this.detectDegradation(timeline)
    if (degradation) patterns.push(degradation)

    // Se nenhum padrao anomalo foi encontrado, reportar como normal
    if (patterns.length === 0) {
      patterns.push({
        type: 'normal',
        description: 'Nenhum padrao comportamental anomalo detectado',
        evidence: 'Latencia e throughput estaveis',
      })
    }

    return patterns
  }

  /**
   * Detecta throttling: o servidor aumenta a latencia progressivamente
   * para desacelerar o cliente. Compara a latencia media do primeiro
   * terco do teste com o ultimo terco.
   */
  private detectThrottling(timeline: SecondMetrics[]): BehavioralPattern | null {
    const latencies = timeline.map(s => s.latencyAvg)

    const firstThirdEnd = Math.floor(latencies.length / 3)
    const lastThirdStart = Math.floor(latencies.length * 2 / 3)

    const avgLatencyFirstThird = this.calculateAverage(latencies.slice(0, firstThirdEnd))
    const avgLatencyLastThird = this.calculateAverage(latencies.slice(lastThirdStart))

    if (avgLatencyFirstThird <= 0) return null
    if (avgLatencyLastThird <= avgLatencyFirstThird * THROTTLING_LATENCY_FACTOR) return null

    const increaseFactor = (avgLatencyLastThird / avgLatencyFirstThird).toFixed(1)

    return {
      type: 'throttling',
      description: `Throttling detectado: latencia aumentou ${increaseFactor}x durante o teste`,
      startSecond: firstThirdEnd,
      evidence: `Latencia media: ${avgLatencyFirstThird.toFixed(0)}ms -> ${avgLatencyLastThird.toFixed(0)}ms`,
    }
  }

  /**
   * Detecta bloqueio abrupto: taxa de erro salta de <20% para >50%
   * em um unico segundo, indicando que uma protecao foi ativada.
   */
  private detectBlocking(timeline: SecondMetrics[]): BehavioralPattern | null {
    const errorRates = timeline.map(s => {
      if (s.requests === 0) return 0

      // Contar erros HTTP relevantes (403, 429 e 5xx) alem dos erros de conexao
      const httpErrorCount = Object.entries(s.statusCodes)
        .filter(([code]) => code === '403' || code === '429' || Number(code) >= 500)
        .reduce((sum, [, count]) => sum + count, 0)

      return ((s.errors + httpErrorCount) / s.requests) * 100
    })

    for (let i = 1; i < errorRates.length; i++) {
      const previousRate = errorRates[i - 1]
      const currentRate = errorRates[i]

      if (currentRate > BLOCKING_ERROR_THRESHOLD && previousRate < BLOCKING_NORMAL_THRESHOLD) {
        const blockSecond = timeline[i].second
        return {
          type: 'blocking',
          description: `Bloqueio detectado a partir do segundo ${blockSecond}: taxa de erro subiu abruptamente acima de ${BLOCKING_ERROR_THRESHOLD}%`,
          startSecond: blockSecond,
          evidence: `Error rate saltou de <${BLOCKING_NORMAL_THRESHOLD}% para >${BLOCKING_ERROR_THRESHOLD}% em 1 segundo`,
        }
      }
    }

    return null
  }

  /**
   * Detecta challenge pages: grande proporcao de respostas 403/503
   * indica que o servidor esta apresentando paginas de verificacao
   * (CAPTCHA, JavaScript challenge, etc.).
   */
  private detectChallenge(timeline: SecondMetrics[]): BehavioralPattern | null {
    const challengeResponseCount = timeline.reduce((acc, s) => {
      return acc + (s.statusCodes['403'] || 0) + (s.statusCodes['503'] || 0)
    }, 0)

    const totalRequests = timeline.reduce((acc, s) => acc + s.requests, 0)

    if (totalRequests === 0) return null

    const challengeRatio = challengeResponseCount / totalRequests
    if (challengeRatio <= CHALLENGE_RATIO_THRESHOLD) return null

    return {
      type: 'challenge',
      description: `Challenge pages detectadas: ${(challengeRatio * 100).toFixed(1)}% das respostas sao 403/503`,
      evidence: `${challengeResponseCount} de ${totalRequests} requests bloqueados`,
    }
  }

  /**
   * Detecta degradacao de throughput: o numero de requests por segundo
   * cai significativamente durante o teste, indicando que o servidor
   * ou alguma protecao esta limitando a capacidade.
   */
  private detectDegradation(timeline: SecondMetrics[]): BehavioralPattern | null {
    const rpsValues = timeline.map(s => s.requests)

    const firstThirdEnd = Math.max(1, Math.floor(rpsValues.length / 3))
    const lastThirdStart = Math.floor(rpsValues.length * 2 / 3)

    const avgRpsFirstThird = this.calculateAverage(rpsValues.slice(0, firstThirdEnd))
    const avgRpsLastThird = this.calculateAverage(rpsValues.slice(lastThirdStart))

    if (avgRpsFirstThird <= 0) return null
    if (avgRpsLastThird >= avgRpsFirstThird * DEGRADATION_RPS_FACTOR) return null

    const dropPercentage = ((1 - avgRpsLastThird / avgRpsFirstThird) * 100).toFixed(0)

    return {
      type: 'degradation',
      description: `Degradacao de throughput: RPS caiu ${dropPercentage}% durante o teste`,
      startSecond: firstThirdEnd,
      evidence: `RPS: ${avgRpsFirstThird.toFixed(0)} -> ${avgRpsLastThird.toFixed(0)}`,
    }
  }

  /**
   * Converte padroes comportamentais anomalos (throttling, blocking)
   * em deteccoes formais no mapa, para que aparecam no relatorio.
   */
  private addBehavioralDetections(
    patterns: BehavioralPattern[],
    detectionMap: Map<string, ProtectionDetection>,
  ): void {
    for (const pattern of patterns) {
      if (pattern.type !== 'throttling' && pattern.type !== 'blocking') continue

      const key = `behavior_${pattern.type}`
      if (detectionMap.has(key)) continue

      detectionMap.set(key, {
        type: pattern.type === 'throttling' ? 'rate-limiter' : 'waf',
        provider: 'unknown',
        confidence: 60,
        confidenceLevel: 'medium',
        indicators: [{
          source: 'behavior',
          name: pattern.type,
          value: pattern.evidence,
          detail: pattern.description,
        }],
        description: pattern.description,
      })
    }
  }

  // -------------------------------------------------------------------------
  // Calculo de risco e geracao de resumo
  // -------------------------------------------------------------------------

  /**
   * Calcula o nivel de risco geral com base nas deteccoes encontradas,
   * informacoes de rate limiting e padroes comportamentais.
   *
   * O risco indica a probabilidade de que o teste de estresse seja
   * significativamente impactado pelas protecoes detectadas.
   */
  private calculateOverallRisk(
    detections: ProtectionDetection[],
    rateLimitInfo: RateLimitInfo,
    behavioralPatterns: BehavioralPattern[],
  ): ProtectionReport['overallRisk'] {
    const hasNoDetections = detections.length === 0
    const hasNoRateLimit = !rateLimitInfo.detected
    const hasNormalBehavior = behavioralPatterns.every(b => b.type === 'normal')

    if (hasNoDetections && hasNoRateLimit && hasNormalBehavior) {
      return 'none'
    }

    let riskScore = 0

    // Somar pontos de risco por cada protecao detectada
    for (const detection of detections) {
      const weight = RISK_WEIGHTS[detection.type] ?? RISK_WEIGHTS['unknown']
      riskScore += detection.confidence * weight
    }

    // Somar pontos por rate limiting confirmado
    if (rateLimitInfo.detected) {
      riskScore += RATE_LIMIT_RISK_POINTS
    }

    // Somar pontos por padroes comportamentais anomalos
    for (const pattern of behavioralPatterns) {
      riskScore += BEHAVIORAL_RISK_POINTS[pattern.type] ?? 0
    }

    // Classificar risco com base nos limiares
    if (riskScore >= RISK_THRESHOLDS.critical) return 'critical'
    if (riskScore >= RISK_THRESHOLDS.high) return 'high'
    if (riskScore >= RISK_THRESHOLDS.medium) return 'medium'
    if (riskScore > 0) return 'low'
    return 'none'
  }

  /**
   * Gera um resumo legivel em portugues com as protecoes detectadas,
   * provedores identificados, rate limiting e padroes comportamentais.
   */
  private generateSummary(
    detections: ProtectionDetection[],
    rateLimitInfo: RateLimitInfo,
    behavioralPatterns: BehavioralPattern[],
  ): string {
    if (detections.length === 0 && !rateLimitInfo.detected) {
      return 'Nenhuma protecao de seguranca visivel detectada. O alvo nao apresentou sinais de WAF, CDN ou rate limiting nas amostras analisadas.'
    }

    const summaryParts: string[] = []

    // Listar provedores unicos detectados (ignorando "unknown")
    const uniqueProviders = [
      ...new Set(
        detections
          .filter(d => d.provider !== 'unknown')
          .map(d => d.provider)
      ),
    ]
    if (uniqueProviders.length > 0) {
      const providerNames = uniqueProviders.map(p => PROVIDER_DISPLAY_NAMES[p] ?? p)
      summaryParts.push(`Provedores detectados: ${providerNames.join(', ')}`)
    }

    // Listar tipos de protecao unicos detectados
    const uniqueTypes = [...new Set(detections.map(d => d.type))]
    const typeNames = uniqueTypes.map(t => PROTECTION_TYPE_SHORT_LABELS[t] ?? t)
    summaryParts.push(`Tipos de protecao: ${typeNames.join(', ')}`)

    // Detalhes de rate limiting
    if (rateLimitInfo.detected) {
      const details: string[] = []
      if (rateLimitInfo.limitPerWindow) details.push(`limite: ${rateLimitInfo.limitPerWindow}`)
      if (rateLimitInfo.triggerPoint) details.push(`ativado no segundo ${rateLimitInfo.triggerPoint}`)

      const suffix = details.length > 0 ? ` (${details.join(', ')})` : ' ativo'
      summaryParts.push(`Rate limiting${suffix}`)
    }

    // Padroes comportamentais anomalos
    const anomalousPatterns = behavioralPatterns.filter(b => b.type !== 'normal')
    if (anomalousPatterns.length > 0) {
      const descriptions = anomalousPatterns.map(b => b.description).join('; ')
      summaryParts.push(`Padroes comportamentais: ${descriptions}`)
    }

    return summaryParts.join('. ') + '.'
  }

  // -------------------------------------------------------------------------
  // Utilitarios internos
  // -------------------------------------------------------------------------

  /**
   * Insere ou atualiza uma deteccao no mapa.
   *
   * Se ja existe uma deteccao com a mesma chave, atualiza a confianca
   * (mantendo o maior valor) e adiciona o indicador se for novo.
   * Se nao existe, cria uma nova deteccao.
   */
  private upsertDetection(
    detectionMap: Map<string, ProtectionDetection>,
    params: {
      key: string
      type: ProtectionType
      provider: ProtectionProvider
      confidence: number
      indicator: ProtectionIndicator
      description: string
    },
  ): void {
    const existing = detectionMap.get(params.key)

    if (existing) {
      // Atualizar confianca com o maior valor encontrado
      existing.confidence = Math.min(MAX_CONFIDENCE, Math.max(existing.confidence, params.confidence))
      existing.confidenceLevel = this.resolveConfidenceLevel(existing.confidence)

      // Adicionar indicador apenas se ainda nao existe um com o mesmo nome
      const isDuplicate = existing.indicators.some(i => i.name === params.indicator.name)
      if (!isDuplicate) {
        existing.indicators.push(params.indicator)
      }
    } else {
      detectionMap.set(params.key, {
        type: params.type,
        provider: params.provider,
        confidence: params.confidence,
        confidenceLevel: this.resolveConfidenceLevel(params.confidence),
        indicators: [params.indicator],
        description: params.description,
      })
    }
  }

  /** Converte um valor numerico de confianca (0-100) em nivel qualitativo. */
  private resolveConfidenceLevel(confidence: number): ConfidenceLevel {
    if (confidence >= 80) return 'high'
    if (confidence >= 50) return 'medium'
    return 'low'
  }

  /** Gera descricao legivel combinando nome do provedor e tipo de protecao. */
  private buildProviderDescription(provider: ProtectionProvider, type: ProtectionType): string {
    const providerName = PROVIDER_DISPLAY_NAMES[provider] ?? provider
    const typeLabel = PROTECTION_TYPE_LABELS[type] ?? type
    return `${providerName} -- ${typeLabel}`
  }

  /** Calcula a media aritmetica de um array de numeros. Retorna 0 se vazio. */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((sum, val) => sum + val, 0) / values.length
  }
}
