import type { SecondMetrics } from './stress-engine'

// === Types (mirrored from renderer for isolation) ===

type ProtectionType = 'waf' | 'cdn' | 'rate-limiter' | 'anti-bot' | 'ddos-protection' | 'captcha' | 'unknown'

type ProtectionProvider =
  | 'cloudflare' | 'akamai' | 'fastly' | 'imperva' | 'sucuri'
  | 'aws-waf' | 'aws-cloudfront' | 'azure-frontdoor' | 'google-cloud-armor'
  | 'ddos-guard' | 'stackpath' | 'varnish' | 'nginx' | 'custom' | 'unknown'

type ConfidenceLevel = 'high' | 'medium' | 'low'

interface ProtectionIndicator {
  source: 'header' | 'cookie' | 'status-code' | 'body' | 'behavior' | 'timing'
  name: string
  value: string
  detail: string
}

interface ProtectionDetection {
  type: ProtectionType
  provider: ProtectionProvider
  confidence: number
  confidenceLevel: ConfidenceLevel
  indicators: ProtectionIndicator[]
  description: string
}

interface RateLimitInfo {
  detected: boolean
  triggerPoint?: number
  limitPerWindow?: string
  windowSeconds?: number
  recoveryPattern?: string
}

interface BehavioralPattern {
  type: 'throttling' | 'blocking' | 'challenge' | 'degradation' | 'normal'
  description: string
  startSecond?: number
  evidence: string
}

interface ProtectionReport {
  detections: ProtectionDetection[]
  rateLimitInfo: RateLimitInfo
  behavioralPatterns: BehavioralPattern[]
  overallRisk: 'none' | 'low' | 'medium' | 'high' | 'critical'
  summary: string
  analysisTimestamp: string
}

/** Dados de amostra capturados de uma resposta HTTP */
export interface ResponseSample {
  statusCode: number
  headers: Record<string, string>
  cookies: string[]
  bodySnippet: string
  timestamp: number
}

// === Header Signature Database ===

interface HeaderSignature {
  header: string
  pattern: RegExp | string
  provider: ProtectionProvider
  type: ProtectionType
  confidence: number
  detail: string
}

const HEADER_SIGNATURES: HeaderSignature[] = [
  // Cloudflare
  { header: 'cf-ray', pattern: /.+/, provider: 'cloudflare', type: 'cdn', confidence: 95, detail: 'Cloudflare Ray ID detectado' },
  { header: 'cf-cache-status', pattern: /.+/, provider: 'cloudflare', type: 'cdn', confidence: 90, detail: 'Cloudflare cache ativo' },
  { header: 'cf-mitigated', pattern: /.+/, provider: 'cloudflare', type: 'ddos-protection', confidence: 95, detail: 'Mitigação Cloudflare ativa' },
  { header: 'server', pattern: /cloudflare/i, provider: 'cloudflare', type: 'waf', confidence: 90, detail: 'Servidor Cloudflare identificado' },
  { header: 'cf-connecting-ip', pattern: /.+/, provider: 'cloudflare', type: 'cdn', confidence: 80, detail: 'Proxy Cloudflare detectado' },

  // Akamai
  { header: 'x-akamai-transformed', pattern: /.+/, provider: 'akamai', type: 'cdn', confidence: 95, detail: 'Transformação Akamai detectada' },
  { header: 'x-akamai-request-id', pattern: /.+/, provider: 'akamai', type: 'cdn', confidence: 95, detail: 'Request ID Akamai' },
  { header: 'akamai-grn', pattern: /.+/, provider: 'akamai', type: 'cdn', confidence: 90, detail: 'Akamai GRN detectado' },
  { header: 'server', pattern: /akamaighost|akamainetwok/i, provider: 'akamai', type: 'cdn', confidence: 90, detail: 'Servidor Akamai identificado' },
  { header: 'x-akamai-session-info', pattern: /.+/, provider: 'akamai', type: 'anti-bot', confidence: 85, detail: 'Sessão anti-bot Akamai' },

  // Fastly
  { header: 'x-served-by', pattern: /cache-/i, provider: 'fastly', type: 'cdn', confidence: 85, detail: 'Fastly cache edge detectado' },
  { header: 'x-fastly-request-id', pattern: /.+/, provider: 'fastly', type: 'cdn', confidence: 95, detail: 'Fastly request ID' },
  { header: 'fastly-io-info', pattern: /.+/, provider: 'fastly', type: 'cdn', confidence: 90, detail: 'Fastly IO Info' },
  { header: 'via', pattern: /varnish/i, provider: 'fastly', type: 'cdn', confidence: 70, detail: 'Varnish via Fastly' },

  // Imperva / Incapsula
  { header: 'x-iinfo', pattern: /.+/, provider: 'imperva', type: 'waf', confidence: 90, detail: 'Imperva Incapsula detectado' },
  { header: 'x-cdn', pattern: /incapsula|imperva/i, provider: 'imperva', type: 'waf', confidence: 95, detail: 'Imperva CDN header' },

  // Sucuri
  { header: 'x-sucuri-id', pattern: /.+/, provider: 'sucuri', type: 'waf', confidence: 95, detail: 'Sucuri WAF detectado' },
  { header: 'server', pattern: /sucuri/i, provider: 'sucuri', type: 'waf', confidence: 90, detail: 'Servidor Sucuri identificado' },
  { header: 'x-sucuri-cache', pattern: /.+/, provider: 'sucuri', type: 'cdn', confidence: 85, detail: 'Sucuri cache ativo' },

  // AWS
  { header: 'x-amzn-requestid', pattern: /.+/, provider: 'aws-waf', type: 'waf', confidence: 70, detail: 'AWS request ID (possível WAF)' },
  { header: 'x-amz-cf-id', pattern: /.+/, provider: 'aws-cloudfront', type: 'cdn', confidence: 90, detail: 'CloudFront distribution ID' },
  { header: 'x-amz-cf-pop', pattern: /.+/, provider: 'aws-cloudfront', type: 'cdn', confidence: 90, detail: 'CloudFront POP edge' },
  { header: 'server', pattern: /amazons3|cloudfront/i, provider: 'aws-cloudfront', type: 'cdn', confidence: 85, detail: 'AWS CloudFront detectado' },

  // Azure
  { header: 'x-azure-ref', pattern: /.+/, provider: 'azure-frontdoor', type: 'cdn', confidence: 90, detail: 'Azure Front Door detectado' },
  { header: 'x-fd-healthprobe', pattern: /.+/, provider: 'azure-frontdoor', type: 'cdn', confidence: 85, detail: 'Azure Front Door health' },

  // Google Cloud Armor
  { header: 'x-goog-request-params', pattern: /.+/, provider: 'google-cloud-armor', type: 'waf', confidence: 70, detail: 'Google Cloud request params' },
  { header: 'server', pattern: /gws|google/i, provider: 'google-cloud-armor', type: 'cdn', confidence: 60, detail: 'Servidor Google detectado' },

  // DDoS-Guard
  { header: 'server', pattern: /ddos-guard/i, provider: 'ddos-guard', type: 'ddos-protection', confidence: 95, detail: 'DDoS-Guard server detectado' },

  // StackPath
  { header: 'x-sp-url', pattern: /.+/, provider: 'stackpath', type: 'cdn', confidence: 85, detail: 'StackPath CDN detectado' },

  // Varnish (standalone)
  { header: 'x-varnish', pattern: /.+/, provider: 'varnish', type: 'cdn', confidence: 80, detail: 'Varnish cache detectado' },
  { header: 'via', pattern: /varnish/i, provider: 'varnish', type: 'cdn', confidence: 75, detail: 'Varnish proxy via header' },

  // Nginx
  { header: 'server', pattern: /^nginx/i, provider: 'nginx', type: 'waf', confidence: 40, detail: 'Nginx server (possível rate limiter)' },

  // Generic rate limiting
  { header: 'x-ratelimit-limit', pattern: /.+/, provider: 'unknown', type: 'rate-limiter', confidence: 95, detail: 'Rate limit header presente' },
  { header: 'x-ratelimit-remaining', pattern: /.+/, provider: 'unknown', type: 'rate-limiter', confidence: 95, detail: 'Rate limit remaining' },
  { header: 'x-ratelimit-reset', pattern: /.+/, provider: 'unknown', type: 'rate-limiter', confidence: 90, detail: 'Rate limit reset timer' },
  { header: 'retry-after', pattern: /.+/, provider: 'unknown', type: 'rate-limiter', confidence: 85, detail: 'Retry-After header presente' },
  { header: 'x-rate-limit-limit', pattern: /.+/, provider: 'unknown', type: 'rate-limiter', confidence: 90, detail: 'Rate limit (formato alternativo)' },
]

// === Cookie Signature Database ===

interface CookieSignature {
  pattern: RegExp
  provider: ProtectionProvider
  type: ProtectionType
  confidence: number
  detail: string
}

const COOKIE_SIGNATURES: CookieSignature[] = [
  { pattern: /^__cf_bm=/, provider: 'cloudflare', type: 'anti-bot', confidence: 90, detail: 'Cloudflare Bot Management cookie' },
  { pattern: /^cf_clearance=/, provider: 'cloudflare', type: 'captcha', confidence: 85, detail: 'Cloudflare clearance (pós-challenge)' },
  { pattern: /^__cfduid=/, provider: 'cloudflare', type: 'cdn', confidence: 80, detail: 'Cloudflare identificador' },
  { pattern: /^cf_ob_info=/, provider: 'cloudflare', type: 'ddos-protection', confidence: 80, detail: 'Cloudflare Always Online cookie' },
  { pattern: /^_cf_/, provider: 'cloudflare', type: 'waf', confidence: 75, detail: 'Cookie Cloudflare genérico' },
  { pattern: /^ak_bmsc=/, provider: 'akamai', type: 'anti-bot', confidence: 90, detail: 'Akamai Bot Manager cookie' },
  { pattern: /^bm_sv=/, provider: 'akamai', type: 'anti-bot', confidence: 85, detail: 'Akamai Bot Manager session' },
  { pattern: /^bm_mi=/, provider: 'akamai', type: 'anti-bot', confidence: 85, detail: 'Akamai Bot Manager ID' },
  { pattern: /^_abck=/, provider: 'akamai', type: 'anti-bot', confidence: 90, detail: 'Akamai anti-bot cookie (_abck)' },
  { pattern: /^visid_incap_/, provider: 'imperva', type: 'waf', confidence: 90, detail: 'Imperva Incapsula visitor ID' },
  { pattern: /^incap_ses_/, provider: 'imperva', type: 'waf', confidence: 90, detail: 'Imperva Incapsula session' },
  { pattern: /^reese84=/, provider: 'imperva', type: 'anti-bot', confidence: 85, detail: 'Imperva Advanced Bot Protection' },
  { pattern: /^sucuri_cloudproxy_/, provider: 'sucuri', type: 'waf', confidence: 90, detail: 'Sucuri cloud proxy cookie' },
  { pattern: /^datadome=/, provider: 'custom', type: 'anti-bot', confidence: 90, detail: 'DataDome anti-bot cookie' },
  { pattern: /^__ddg/, provider: 'ddos-guard', type: 'ddos-protection', confidence: 85, detail: 'DDoS-Guard cookie' },
]

// === Body Pattern Database ===

interface BodySignature {
  pattern: RegExp
  provider: ProtectionProvider
  type: ProtectionType
  confidence: number
  detail: string
}

const BODY_SIGNATURES: BodySignature[] = [
  { pattern: /cf-browser-verification|cf-challenge|cf\.challenge/i, provider: 'cloudflare', type: 'captcha', confidence: 90, detail: 'Cloudflare challenge page detectada' },
  { pattern: /attention required.*cloudflare/i, provider: 'cloudflare', type: 'waf', confidence: 85, detail: 'Cloudflare WAF block page' },
  { pattern: /checking your browser.*cloudflare/i, provider: 'cloudflare', type: 'anti-bot', confidence: 90, detail: 'Cloudflare Under Attack Mode' },
  { pattern: /ray id:/i, provider: 'cloudflare', type: 'waf', confidence: 70, detail: 'Cloudflare Ray ID na página de erro' },
  { pattern: /access denied.*incapsula/i, provider: 'imperva', type: 'waf', confidence: 90, detail: 'Imperva block page' },
  { pattern: /incident id.*incapsula/i, provider: 'imperva', type: 'waf', confidence: 85, detail: 'Imperva incident ID' },
  { pattern: /sucuri website firewall/i, provider: 'sucuri', type: 'waf', confidence: 95, detail: 'Sucuri WAF block page' },
  { pattern: /access denied.*sucuri/i, provider: 'sucuri', type: 'waf', confidence: 90, detail: 'Sucuri access denied' },
  { pattern: /akamai.*access denied|ghost.*access denied/i, provider: 'akamai', type: 'waf', confidence: 80, detail: 'Akamai block page' },
  { pattern: /ddos-guard/i, provider: 'ddos-guard', type: 'ddos-protection', confidence: 90, detail: 'DDoS-Guard block page' },
  { pattern: /captcha|recaptcha|hcaptcha|turnstile/i, provider: 'unknown', type: 'captcha', confidence: 80, detail: 'CAPTCHA detectado na resposta' },
  { pattern: /<title>.*403.*forbidden.*<\/title>/i, provider: 'unknown', type: 'waf', confidence: 60, detail: 'Página 403 Forbidden (possível WAF)' },
  { pattern: /rate limit|too many requests/i, provider: 'unknown', type: 'rate-limiter', confidence: 75, detail: 'Mensagem de rate limit no body' },
]

// === Protection Detector ===

const SAMPLE_INTERVAL_MS = 2000
const MAX_SAMPLES = 50

export class ProtectionDetector {
  private samples: ResponseSample[] = []
  private lastSampleTime = 0
  private sampleCount = 0
  private timelineRef: SecondMetrics[] = []

  /**
   * Registra amostra de resposta para análise incrementa.
   * Chamado pelo stress engine para um subconjunto de requests (amostragem).
   */
  collectSample(sample: ResponseSample): void {
    if (this.samples.length >= MAX_SAMPLES) return
    const now = Date.now()
    if (now - this.lastSampleTime < SAMPLE_INTERVAL_MS && this.sampleCount > 2) return
    this.samples.push(sample)
    this.lastSampleTime = now
    this.sampleCount++
  }

  /** Referência à timeline para análise comportamental */
  setTimeline(timeline: SecondMetrics[]): void {
    this.timelineRef = timeline
  }

  /**
   * Gera o relatório final de proteção. Chamado após o teste finalizar.
   * Complexidade: O(samples * signatures) — limitado por MAX_SAMPLES.
   */
  analyze(): ProtectionReport {
    const detectionMap = new Map<string, ProtectionDetection>()

    for (const sample of this.samples) {
      this.analyzeHeaders(sample, detectionMap)
      this.analyzeCookies(sample, detectionMap)
      this.analyzeBody(sample, detectionMap)
      this.analyzeStatusCode(sample, detectionMap)
    }

    const rateLimitInfo = this.analyzeRateLimiting()
    const behavioralPatterns = this.analyzeBehavior()

    // Adicionar detecções comportamentais
    for (const pattern of behavioralPatterns) {
      if (pattern.type === 'throttling' || pattern.type === 'blocking') {
        const key = `behavior_${pattern.type}`
        if (!detectionMap.has(key)) {
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
    }

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

  private analyzeHeaders(sample: ResponseSample, map: Map<string, ProtectionDetection>): void {
    for (const sig of HEADER_SIGNATURES) {
      const headerValue = sample.headers[sig.header.toLowerCase()]
      if (!headerValue) continue

      const matches = typeof sig.pattern === 'string'
        ? headerValue.toLowerCase().includes(sig.pattern.toLowerCase())
        : sig.pattern.test(headerValue)

      if (!matches) continue

      const key = `${sig.provider}_${sig.type}`
      const existing = map.get(key)

      if (existing) {
        // Incrementar confiança e adicionar indicador se novo
        existing.confidence = Math.min(99, Math.max(existing.confidence, sig.confidence))
        existing.confidenceLevel = this.getConfidenceLevel(existing.confidence)
        const alreadyHas = existing.indicators.some(i => i.name === sig.header)
        if (!alreadyHas) {
          existing.indicators.push({
            source: 'header',
            name: sig.header,
            value: headerValue,
            detail: sig.detail,
          })
        }
      } else {
        map.set(key, {
          type: sig.type,
          provider: sig.provider,
          confidence: sig.confidence,
          confidenceLevel: this.getConfidenceLevel(sig.confidence),
          indicators: [{
            source: 'header',
            name: sig.header,
            value: headerValue,
            detail: sig.detail,
          }],
          description: this.getProviderDescription(sig.provider, sig.type),
        })
      }
    }
  }

  private analyzeCookies(sample: ResponseSample, map: Map<string, ProtectionDetection>): void {
    for (const cookie of sample.cookies) {
      for (const sig of COOKIE_SIGNATURES) {
        if (!sig.pattern.test(cookie)) continue

        const key = `${sig.provider}_${sig.type}`
        const existing = map.get(key)
        const cookieName = cookie.split('=')[0] || cookie

        if (existing) {
          existing.confidence = Math.min(99, Math.max(existing.confidence, sig.confidence))
          existing.confidenceLevel = this.getConfidenceLevel(existing.confidence)
          const alreadyHas = existing.indicators.some(i => i.name === cookieName)
          if (!alreadyHas) {
            existing.indicators.push({
              source: 'cookie',
              name: cookieName,
              value: cookie.substring(0, 80),
              detail: sig.detail,
            })
          }
        } else {
          map.set(key, {
            type: sig.type,
            provider: sig.provider,
            confidence: sig.confidence,
            confidenceLevel: this.getConfidenceLevel(sig.confidence),
            indicators: [{
              source: 'cookie',
              name: cookieName,
              value: cookie.substring(0, 80),
              detail: sig.detail,
            }],
            description: this.getProviderDescription(sig.provider, sig.type),
          })
        }
      }
    }
  }

  private analyzeBody(sample: ResponseSample, map: Map<string, ProtectionDetection>): void {
    if (!sample.bodySnippet) return

    for (const sig of BODY_SIGNATURES) {
      if (!sig.pattern.test(sample.bodySnippet)) continue

      const key = `${sig.provider}_${sig.type}_body`
      if (map.has(key)) {
        const existing = map.get(key)!
        existing.confidence = Math.min(99, Math.max(existing.confidence, sig.confidence))
        existing.confidenceLevel = this.getConfidenceLevel(existing.confidence)
        continue
      }

      map.set(key, {
        type: sig.type,
        provider: sig.provider,
        confidence: sig.confidence,
        confidenceLevel: this.getConfidenceLevel(sig.confidence),
        indicators: [{
          source: 'body',
          name: 'response-body',
          value: sample.bodySnippet.substring(0, 120),
          detail: sig.detail,
        }],
        description: sig.detail,
      })
    }
  }

  private analyzeStatusCode(sample: ResponseSample, map: Map<string, ProtectionDetection>): void {
    const code = sample.statusCode

    if (code === 403) {
      const key = 'statuscode_waf'
      if (!map.has(key)) {
        map.set(key, {
          type: 'waf',
          provider: 'unknown',
          confidence: 50,
          confidenceLevel: 'low',
          indicators: [{
            source: 'status-code',
            name: '403',
            value: 'Forbidden',
            detail: 'Status 403 pode indicar WAF bloqueando requests',
          }],
          description: 'Status HTTP 403 detectado — possível bloqueio por WAF',
        })
      }
    }

    if (code === 429) {
      const key = 'statuscode_ratelimit'
      if (!map.has(key)) {
        map.set(key, {
          type: 'rate-limiter',
          provider: 'unknown',
          confidence: 95,
          confidenceLevel: 'high',
          indicators: [{
            source: 'status-code',
            name: '429',
            value: 'Too Many Requests',
            detail: 'Rate limiting ativo — servidor rejeitando requests excedentes',
          }],
          description: 'Rate limiting detectado via HTTP 429',
        })
      }
    }

    if (code === 503) {
      const key = 'statuscode_ddos'
      if (!map.has(key)) {
        map.set(key, {
          type: 'ddos-protection',
          provider: 'unknown',
          confidence: 45,
          confidenceLevel: 'low',
          indicators: [{
            source: 'status-code',
            name: '503',
            value: 'Service Unavailable',
            detail: 'Status 503 pode indicar proteção DDoS ativa ou servidor sobrecarregado',
          }],
          description: 'Status 503 detectado — possível proteção DDoS ou sobrecarga',
        })
      }
    }
  }

  private analyzeRateLimiting(): RateLimitInfo {
    // Buscar headers de rate limit nas amostras
    let limitPerWindow: string | undefined
    let windowSeconds: number | undefined

    for (const sample of this.samples) {
      const limit = sample.headers['x-ratelimit-limit'] || sample.headers['x-rate-limit-limit']
      const reset = sample.headers['x-ratelimit-reset'] || sample.headers['retry-after']

      if (limit) limitPerWindow = limit
      if (reset) {
        const resetNum = Number(reset)
        if (!isNaN(resetNum) && resetNum > 0) {
          windowSeconds = resetNum > 1e9 ? Math.floor((resetNum - Date.now() / 1000)) : resetNum
        }
      }
    }

    // Detectar rate limiting por padrão de status codes na timeline
    const has429 = this.samples.some(s => s.statusCode === 429)
    const timeline = this.timelineRef

    let triggerPoint: number | undefined
    let recoveryPattern: string | undefined

    if (timeline.length > 2) {
      // Encontrar o segundo onde 429s começaram a aparecer
      for (const sec of timeline) {
        if (sec.statusCodes['429'] && sec.statusCodes['429'] > 0) {
          triggerPoint = sec.second
          break
        }
      }

      // Verificar padrão de recuperação (errors diminuem após pico)
      const errorRates = timeline.map(s => s.requests > 0 ? s.errors / s.requests : 0)
      const peakIdx = errorRates.indexOf(Math.max(...errorRates))
      if (peakIdx > 0 && peakIdx < errorRates.length - 1) {
        const afterPeak = errorRates.slice(peakIdx + 1)
        const recovering = afterPeak.length >= 2 && afterPeak[afterPeak.length - 1] < afterPeak[0]
        if (recovering) {
          recoveryPattern = 'Parcialmente recuperável — taxa de erro diminui após pico'
        } else {
          recoveryPattern = 'Sem recuperação — bloqueio persistente'
        }
      }
    }

    return {
      detected: has429 || !!limitPerWindow,
      triggerPoint,
      limitPerWindow,
      windowSeconds,
      recoveryPattern,
    }
  }

  private analyzeBehavior(): BehavioralPattern[] {
    const patterns: BehavioralPattern[] = []
    const timeline = this.timelineRef

    if (timeline.length < 3) {
      patterns.push({ type: 'normal', description: 'Dados insuficientes para análise comportamental', evidence: 'Timeline < 3 segundos' })
      return patterns
    }

    // === Throttling detection ===
    // Latência aumenta progressivamente → servidor está throttling
    const latencies = timeline.map(s => s.latencyAvg)
    const firstThird = latencies.slice(0, Math.floor(latencies.length / 3))
    const lastThird = latencies.slice(Math.floor(latencies.length * 2 / 3))

    const avgFirst = firstThird.length > 0 ? firstThird.reduce((a, b) => a + b, 0) / firstThird.length : 0
    const avgLast = lastThird.length > 0 ? lastThird.reduce((a, b) => a + b, 0) / lastThird.length : 0

    if (avgFirst > 0 && avgLast > avgFirst * 3) {
      patterns.push({
        type: 'throttling',
        description: `Throttling detectado: latência aumentou ${((avgLast / avgFirst)).toFixed(1)}x durante o teste`,
        startSecond: Math.floor(timeline.length / 3),
        evidence: `Latencia media: ${avgFirst.toFixed(0)}ms > ${avgLast.toFixed(0)}ms`,
      })
    }

    // === Blocking detection ===
    // Taxa de erro efetiva (conexão + HTTP 403/429/5xx) sobe drasticamente
    const errorRates = timeline.map(s => {
      if (s.requests === 0) return 0
      const httpErrors = Object.entries(s.statusCodes)
        .filter(([code]) => code === '403' || code === '429' || Number(code) >= 500)
        .reduce((sum, [, count]) => sum + count, 0)
      return ((s.errors + httpErrors) / s.requests) * 100
    })
    let blockStart: number | undefined

    for (let i = 1; i < errorRates.length; i++) {
      if (errorRates[i] > 50 && errorRates[i - 1] < 20) {
        blockStart = timeline[i].second
        break
      }
    }

    if (blockStart !== undefined) {
      patterns.push({
        type: 'blocking',
        description: `Bloqueio detectado a partir do segundo ${blockStart}: taxa de erro subiu abruptamente acima de 50%`,
        startSecond: blockStart,
        evidence: `Error rate saltou de <20% para >50% em 1 segundo`,
      })
    }

    // === Challenge detection ===
    // Muitas respostas 403 ou 503 indicam challenge pages
    const challengeCodes = timeline.reduce((acc, s) => {
      return acc + (s.statusCodes['403'] || 0) + (s.statusCodes['503'] || 0)
    }, 0)
    const totalReqs = timeline.reduce((acc, s) => acc + s.requests, 0)

    if (totalReqs > 0 && (challengeCodes / totalReqs) > 0.3) {
      patterns.push({
        type: 'challenge',
        description: `Challenge pages detectadas: ${((challengeCodes / totalReqs) * 100).toFixed(1)}% das respostas são 403/503`,
        evidence: `${challengeCodes} de ${totalReqs} requests bloqueados`,
      })
    }

    // === Degradation detection ===
    // RPS cai significativamente durante o teste
    const rpsValues = timeline.map(s => s.requests)
    const rpsFirst = rpsValues.slice(0, Math.max(1, Math.floor(rpsValues.length / 3)))
    const rpsLast = rpsValues.slice(Math.floor(rpsValues.length * 2 / 3))

    const avgRpsFirst = rpsFirst.length > 0 ? rpsFirst.reduce((a, b) => a + b, 0) / rpsFirst.length : 0
    const avgRpsLast = rpsLast.length > 0 ? rpsLast.reduce((a, b) => a + b, 0) / rpsLast.length : 0

    if (avgRpsFirst > 0 && avgRpsLast < avgRpsFirst * 0.4) {
      patterns.push({
        type: 'degradation',
        description: `Degradação de throughput: RPS caiu ${((1 - avgRpsLast / avgRpsFirst) * 100).toFixed(0)}% durante o teste`,
        startSecond: Math.floor(timeline.length / 3),
        evidence: `RPS: ${avgRpsFirst.toFixed(0)} > ${avgRpsLast.toFixed(0)}`,
      })
    }

    if (patterns.length === 0) {
      patterns.push({ type: 'normal', description: 'Nenhum padrão comportamental anômalo detectado', evidence: 'Latência e throughput estáveis' })
    }

    return patterns
  }

  private calculateOverallRisk(
    detections: ProtectionDetection[],
    rateLimitInfo: RateLimitInfo,
    behavior: BehavioralPattern[]
  ): ProtectionReport['overallRisk'] {
    if (detections.length === 0 && !rateLimitInfo.detected && behavior.every(b => b.type === 'normal')) {
      return 'none'
    }

    let riskScore = 0

    for (const d of detections) {
      if (d.type === 'waf' || d.type === 'ddos-protection') riskScore += d.confidence * 0.8
      if (d.type === 'anti-bot' || d.type === 'captcha') riskScore += d.confidence * 0.9
      if (d.type === 'rate-limiter') riskScore += d.confidence * 0.7
      if (d.type === 'cdn') riskScore += d.confidence * 0.2
    }

    if (rateLimitInfo.detected) riskScore += 50
    for (const b of behavior) {
      if (b.type === 'blocking') riskScore += 80
      if (b.type === 'throttling') riskScore += 40
      if (b.type === 'challenge') riskScore += 60
      if (b.type === 'degradation') riskScore += 30
    }

    if (riskScore >= 200) return 'critical'
    if (riskScore >= 120) return 'high'
    if (riskScore >= 60) return 'medium'
    if (riskScore > 0) return 'low'
    return 'none'
  }

  private generateSummary(
    detections: ProtectionDetection[],
    rateLimitInfo: RateLimitInfo,
    behavior: BehavioralPattern[]
  ): string {
    if (detections.length === 0 && !rateLimitInfo.detected) {
      return 'Nenhuma proteção de segurança visível detectada. O alvo não apresentou sinais de WAF, CDN ou rate limiting nas amostras analisadas.'
    }

    const parts: string[] = []

    // Providers detectados
    const providers = [...new Set(detections.filter(d => d.provider !== 'unknown').map(d => d.provider))]
    if (providers.length > 0) {
      parts.push(`Provedores detectados: ${providers.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')}`)
    }

    // Tipos de proteção
    const types = [...new Set(detections.map(d => d.type))]
    const typeLabels: Record<string, string> = {
      'waf': 'WAF',
      'cdn': 'CDN',
      'rate-limiter': 'Rate Limiting',
      'anti-bot': 'Anti-Bot',
      'ddos-protection': 'DDoS Protection',
      'captcha': 'CAPTCHA/Challenge',
      'unknown': 'Proteção desconhecida',
    }
    parts.push(`Tipos de proteção: ${types.map(t => typeLabels[t] || t).join(', ')}`)

    if (rateLimitInfo.detected) {
      const rlDetails = []
      if (rateLimitInfo.limitPerWindow) rlDetails.push(`limite: ${rateLimitInfo.limitPerWindow}`)
      if (rateLimitInfo.triggerPoint) rlDetails.push(`ativado no segundo ${rateLimitInfo.triggerPoint}`)
      parts.push(`Rate limiting ${rlDetails.length > 0 ? `(${rlDetails.join(', ')})` : 'ativo'}`)
    }

    const anomalies = behavior.filter(b => b.type !== 'normal')
    if (anomalies.length > 0) {
      parts.push(`Padrões comportamentais: ${anomalies.map(b => b.description).join('; ')}`)
    }

    return parts.join('. ') + '.'
  }

  private getConfidenceLevel(confidence: number): ConfidenceLevel {
    if (confidence >= 80) return 'high'
    if (confidence >= 50) return 'medium'
    return 'low'
  }

  private getProviderDescription(provider: ProtectionProvider, type: ProtectionType): string {
    const providerNames: Record<string, string> = {
      'cloudflare': 'Cloudflare',
      'akamai': 'Akamai',
      'fastly': 'Fastly',
      'imperva': 'Imperva/Incapsula',
      'sucuri': 'Sucuri',
      'aws-waf': 'AWS WAF',
      'aws-cloudfront': 'AWS CloudFront',
      'azure-frontdoor': 'Azure Front Door',
      'google-cloud-armor': 'Google Cloud Armor',
      'ddos-guard': 'DDoS-Guard',
      'stackpath': 'StackPath',
      'varnish': 'Varnish Cache',
      'nginx': 'Nginx',
      'custom': 'Solução customizada',
      'unknown': 'Provedor desconhecido',
    }
    const typeLabels: Record<string, string> = {
      'waf': 'Web Application Firewall',
      'cdn': 'Content Delivery Network',
      'rate-limiter': 'Rate Limiting',
      'anti-bot': 'Proteção Anti-Bot',
      'ddos-protection': 'Proteção DDoS',
      'captcha': 'CAPTCHA/Challenge',
      'unknown': 'Proteção',
    }
    return `${providerNames[provider] || provider} — ${typeLabels[type] || type}`
  }

  reset(): void {
    this.samples = []
    this.lastSampleTime = 0
    this.sampleCount = 0
    this.timelineRef = []
  }
}
