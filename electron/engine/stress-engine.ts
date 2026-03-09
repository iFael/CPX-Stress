import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import { v4 as uuidv4 } from 'uuid'
import { ProtectionDetector } from './protection-detector'
import type { ResponseSample } from './protection-detector'

export interface TestConfig {
  url: string
  virtualUsers: number
  duration: number
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  body?: string
  rampUp?: number
}

export interface SecondMetrics {
  timestamp: number
  second: number
  requests: number
  errors: number
  latencyAvg: number
  latencyP50: number
  latencyP90: number
  latencyP95: number
  latencyP99: number
  latencyMax: number
  latencyMin: number
  statusCodes: Record<string, number>
  bytesReceived: number
  activeUsers: number
}

export interface ProgressData {
  currentSecond: number
  totalSeconds: number
  metrics: SecondMetrics
  cumulative: {
    totalRequests: number
    totalErrors: number
    rps: number
  }
}

export interface TestResult {
  id: string
  url: string
  config: TestConfig
  startTime: string
  endTime: string
  durationSeconds: number
  totalRequests: number
  totalErrors: number
  rps: number
  latency: {
    avg: number
    min: number
    p50: number
    p90: number
    p95: number
    p99: number
    max: number
  }
  errorRate: number
  throughputBytesPerSec: number
  totalBytes: number
  statusCodes: Record<string, number>
  timeline: SecondMetrics[]
  status: 'completed' | 'cancelled' | 'error'
  errorMessage?: string
  protectionReport?: {
    detections: Array<{
      type: string
      provider: string
      confidence: number
      confidenceLevel: string
      indicators: Array<{
        source: string
        name: string
        value: string
        detail: string
      }>
      description: string
    }>
    rateLimitInfo: {
      detected: boolean
      triggerPoint?: number
      limitPerWindow?: string
      windowSeconds?: number
      recoveryPattern?: string
    }
    behavioralPatterns: Array<{
      type: string
      description: string
      startSecond?: number
      evidence: string
    }>
    overallRisk: string
    summary: string
    analysisTimestamp: string
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export class StressEngine {
  private cancelled = false
  private durationExpired = false
  private abortController: AbortController | null = null
  private activeInterval: ReturnType<typeof setInterval> | null = null
  private activeAgent: http.Agent | https.Agent | null = null
  private activeDurationTimer: ReturnType<typeof setTimeout> | null = null
  private vuRequestCount = 0

  private preflight(url: URL, isHttps: boolean, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Cancelado'))
        return
      }

      const mod = isHttps ? https : http
      const req = mod.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: 'HEAD',
          timeout: 10000,
        },
        (res) => {
          res.resume()
          resolve()
        }
      )
      req.on('error', (err: Error) =>
        reject(
          new Error(
            `Não foi possível conectar ao servidor "${url.hostname}": ${err.message}`
          )
        )
      )
      req.on('timeout', () => {
        req.destroy()
        reject(
          new Error(
            `O servidor "${url.hostname}" não respondeu dentro de 10 segundos`
          )
        )
      })

      const abortHandler = () => {
        req.destroy()
        reject(new Error('Cancelado'))
      }
      signal.addEventListener('abort', abortHandler, { once: true })

      req.end()
    })
  }

  async run(
    config: TestConfig,
    onProgress: (data: ProgressData) => void
  ): Promise<TestResult> {
    this.cancelled = false
    this.durationExpired = false
    this.abortController = new AbortController()
    this.vuRequestCount = 0

    const url = new URL(config.url)
    const isHttps = url.protocol === 'https:'

    const signal = this.abortController.signal

    // Verificação de conectividade antes de iniciar o teste
    await this.preflight(url, isHttps, signal)

    const agent = new (isHttps ? https : http).Agent({
      keepAlive: true,
      maxSockets: Math.min(config.virtualUsers * 2, 10000),
      timeout: 30000,
    })
    this.activeAgent = agent

    const testId = uuidv4()
    const startTime = new Date()
    // Reservoir sampling para limitar uso de memória em testes longos
    const latencyReservoir: number[] = []
    const RESERVOIR_MAX = 100_000
    let latencySampleCount = 0
    const globalStatusCodes: Record<string, number> = {}
    let totalErrors = 0
    let totalBytes = 0
    let totalRequests = 0

    // Protection Detection Engine — análise incremental com amostragem
    const protectionDetector = new ProtectionDetector()

    let secLatencies: number[] = []
    let secErrors = 0
    let secRequests = 0
    let secBytes = 0
    let secStatusCodes: Record<string, number> = {}
    let currentSecond = 0

    const timeline: SecondMetrics[] = []
    const rampUp = config.rampUp || 0

    const interval = setInterval(() => {
      if (this.cancelled) return
      currentSecond++
      const activeUsers =
        rampUp > 0
          ? Math.min(
              config.virtualUsers,
              Math.ceil((currentSecond / rampUp) * config.virtualUsers)
            )
          : config.virtualUsers

      const sorted = [...secLatencies].sort((a, b) => a - b)
      const metrics: SecondMetrics = {
        timestamp: Date.now(),
        second: currentSecond,
        requests: secRequests,
        errors: secErrors,
        latencyAvg: sorted.length > 0 ? round2(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
        latencyP50: round2(percentile(sorted, 50)),
        latencyP90: round2(percentile(sorted, 90)),
        latencyP95: round2(percentile(sorted, 95)),
        latencyP99: round2(percentile(sorted, 99)),
        latencyMax: sorted.length > 0 ? round2(sorted[sorted.length - 1]) : 0,
        latencyMin: sorted.length > 0 ? round2(sorted[0]) : 0,
        statusCodes: { ...secStatusCodes },
        bytesReceived: secBytes,
        activeUsers,
      }

      timeline.push(metrics)
      onProgress({
        currentSecond,
        totalSeconds: config.duration,
        metrics,
        cumulative: {
          totalRequests,
          totalErrors,
          rps: currentSecond > 0 ? round2(totalRequests / currentSecond) : 0,
        },
      })

      secLatencies = []
      secErrors = 0
      secRequests = 0
      secBytes = 0
      secStatusCodes = {}
    }, 1000)
    this.activeInterval = interval

    const endTime = Date.now() + config.duration * 1000

    // Timer de segurança: abortar requests in-flight quando a duração expirar
    // Sem isso, VUs com requests lentos (ex: latência >30s) ficam presos além da duração
    this.activeDurationTimer = setTimeout(() => {
      this.durationExpired = true
      this.abortController?.abort()
    }, config.duration * 1000 + 2000) // +2s de margem para finalização natural

    const vuPromises: Promise<void>[] = []
    for (let i = 0; i < config.virtualUsers; i++) {
      const delay =
        rampUp > 0
          ? Math.floor((i / config.virtualUsers) * rampUp * 1000)
          : 0

      vuPromises.push(
        this.spawnVU(delay, {
          url,
          isHttps,
          agent,
          config,
          endTime,
          signal,
          onResponse: (latency: number, statusCode: number, bytes: number, sample?: ResponseSample) => {
            // Reservoir sampling: manter no máximo RESERVOIR_MAX amostras
            latencySampleCount++
            if (latencyReservoir.length < RESERVOIR_MAX) {
              latencyReservoir.push(latency)
            } else {
              const j = Math.floor(Math.random() * latencySampleCount)
              if (j < RESERVOIR_MAX) {
                latencyReservoir[j] = latency
              }
            }
            secLatencies.push(latency)
            secRequests++
            totalRequests++
            totalBytes += bytes
            secBytes += bytes
            const code = String(statusCode)
            globalStatusCodes[code] = (globalStatusCodes[code] || 0) + 1
            secStatusCodes[code] = (secStatusCodes[code] || 0) + 1

            // Alimentar Protection Detector com amostras
            if (sample) {
              protectionDetector.collectSample(sample)
            }
          },
          onError: () => {
            totalErrors++
            secErrors++
            totalRequests++
            secRequests++
          },
        })
      )
    }

    try {
      await Promise.all(vuPromises)
    } catch {
      // Cancelled or error — handled below
    }

    if (this.activeDurationTimer) {
      clearTimeout(this.activeDurationTimer)
      this.activeDurationTimer = null
    }
    clearInterval(interval)
    this.activeInterval = null
    agent.destroy()
    this.activeAgent = null

    const actualEnd = new Date()
    const actualDuration = (actualEnd.getTime() - startTime.getTime()) / 1000
    const sortedAll = latencyReservoir.sort((a, b) => a - b)

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
        max:
          sortedAll.length > 0
            ? round2(sortedAll[sortedAll.length - 1])
            : 0,
      },
      errorRate:
        totalRequests > 0
          ? round2((totalErrors / totalRequests) * 100)
          : 0,
      throughputBytesPerSec: round2(totalBytes / Math.max(actualDuration, 0.1)),
      totalBytes,
      statusCodes: globalStatusCodes,
      timeline,
      status: this.cancelled && !this.durationExpired ? 'cancelled' : 'completed',
    }

    // Gerar relatório de detecção de proteção
    protectionDetector.setTimeline(timeline)
    result.protectionReport = protectionDetector.analyze()

    return result
  }

  private async spawnVU(
    delay: number,
    opts: {
      url: URL
      isHttps: boolean
      agent: http.Agent | https.Agent
      config: TestConfig
      endTime: number
      signal: AbortSignal
      onResponse: (latency: number, statusCode: number, bytes: number, sample?: ResponseSample) => void
      onError: () => void
    }
  ): Promise<void> {
    if (delay > 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay)
        opts.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            resolve()
          },
          { once: true }
        )
      })
    }

    while (Date.now() < opts.endTime && !opts.signal.aborted) {
      const start = performance.now()
      // Capturar amostra a cada ~50 requests para detecção de proteção (baixo overhead)
      this.vuRequestCount++
      const captureSample = this.vuRequestCount % 50 === 1
      try {
        const result = await this.makeRequest(opts, captureSample)
        const latency = performance.now() - start
        opts.onResponse(latency, result.statusCode, result.bytes, result.sample)
      } catch {
        opts.onError()
      }
    }
  }

  private makeRequest(opts: {
    url: URL
    isHttps: boolean
    agent: http.Agent | https.Agent
    config: TestConfig
    signal: AbortSignal
  }, captureSample: boolean = false): Promise<{ statusCode: number; bytes: number; sample?: ResponseSample }> {
    return new Promise((resolve, reject) => {
      if (opts.signal.aborted) {
        reject(new Error('Cancelled'))
        return
      }

      const mod = opts.isHttps ? https : http
      const reqOptions: http.RequestOptions = {
        hostname: opts.url.hostname,
        port: opts.url.port || (opts.isHttps ? 443 : 80),
        path: opts.url.pathname + opts.url.search,
        method: opts.config.method || 'GET',
        agent: opts.agent,
        headers: {
          'User-Agent': 'StressFlow/1.0',
          Accept: '*/*',
          ...opts.config.headers,
        },
        timeout: 30000,
      }

      if (opts.config.body && opts.config.method !== 'GET') {
        reqOptions.headers = {
          ...reqOptions.headers,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(opts.config.body).toString(),
        }
      }

      let settled = false
      const cleanup = () => {
        settled = true
        opts.signal.removeEventListener('abort', abortHandler)
      }

      const abortHandler = () => {
        if (!settled) {
          cleanup()
          req.destroy()
          reject(new Error('Cancelled'))
        }
      }
      opts.signal.addEventListener('abort', abortHandler)

      const req = mod.request(reqOptions, (res) => {
        let bytes = 0
        const bodyChunks: Buffer[] = captureSample ? [] : []
        let bodyCollected = 0
        const BODY_LIMIT = 2048

        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          // Capturar primeiros 2KB do body apenas para amostras de proteção
          if (captureSample && bodyCollected < BODY_LIMIT) {
            const remaining = BODY_LIMIT - bodyCollected
            bodyChunks.push(chunk.subarray(0, remaining))
            bodyCollected += Math.min(chunk.length, remaining)
          }
        })
        res.on('end', () => {
          cleanup()

          let sample: ResponseSample | undefined
          if (captureSample) {
            // Extrair headers relevantes (lowercased)
            const headers: Record<string, string> = {}
            const rawHeaders = res.headers
            for (const [key, val] of Object.entries(rawHeaders)) {
              if (val) {
                headers[key.toLowerCase()] = Array.isArray(val) ? val.join(', ') : val
              }
            }

            // Extrair cookies de Set-Cookie
            const setCookieRaw = res.headers['set-cookie']
            const cookies = setCookieRaw ? setCookieRaw.map(c => c.split(';')[0]) : []

            // Body snippet
            const bodySnippet = bodyChunks.length > 0
              ? Buffer.concat(bodyChunks).toString('utf-8').substring(0, BODY_LIMIT)
              : ''

            sample = {
              statusCode: res.statusCode ?? 0,
              headers,
              cookies,
              bodySnippet,
              timestamp: Date.now(),
            }
          }

          resolve({ statusCode: res.statusCode ?? 0, bytes, sample })
        })
        res.on('error', (err) => {
          cleanup()
          reject(err)
        })
      })

      req.on('error', (err) => {
        cleanup()
        reject(err)
      })
      req.on('timeout', () => {
        cleanup()
        req.destroy()
        reject(new Error('Request timeout'))
      })

      if (opts.config.body && opts.config.method !== 'GET') {
        req.write(opts.config.body)
      }
      req.end()
    })
  }

  cancel(): void {
    this.cancelled = true
    this.abortController?.abort()
    if (this.activeDurationTimer) {
      clearTimeout(this.activeDurationTimer)
      this.activeDurationTimer = null
    }
    if (this.activeInterval) {
      clearInterval(this.activeInterval)
      this.activeInterval = null
    }
    if (this.activeAgent) {
      this.activeAgent.destroy()
      this.activeAgent = null
    }
  }
}
