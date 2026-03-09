import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import { v4 as uuidv4 } from 'uuid'

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
  private abortController: AbortController | null = null

  async run(
    config: TestConfig,
    onProgress: (data: ProgressData) => void
  ): Promise<TestResult> {
    this.cancelled = false
    this.abortController = new AbortController()

    const url = new URL(config.url)
    const isHttps = url.protocol === 'https:'
    const agent = new (isHttps ? https : http).Agent({
      keepAlive: true,
      maxSockets: Math.min(config.virtualUsers * 2, 10000),
      timeout: 30000,
    })

    const testId = uuidv4()
    const startTime = new Date()
    const allLatencies: number[] = []
    const globalStatusCodes: Record<string, number> = {}
    let totalErrors = 0
    let totalBytes = 0
    let totalRequests = 0

    let secLatencies: number[] = []
    let secErrors = 0
    let secRequests = 0
    let secBytes = 0
    let secStatusCodes: Record<string, number> = {}
    let currentSecond = 0

    const timeline: SecondMetrics[] = []
    const rampUp = config.rampUp || 0

    const interval = setInterval(() => {
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

    const endTime = Date.now() + config.duration * 1000
    const signal = this.abortController.signal

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
          onResponse: (latency: number, statusCode: number, bytes: number) => {
            allLatencies.push(latency)
            secLatencies.push(latency)
            secRequests++
            totalRequests++
            totalBytes += bytes
            secBytes += bytes
            const code = String(statusCode)
            globalStatusCodes[code] = (globalStatusCodes[code] || 0) + 1
            secStatusCodes[code] = (secStatusCodes[code] || 0) + 1
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

    clearInterval(interval)
    agent.destroy()

    const actualEnd = new Date()
    const actualDuration = (actualEnd.getTime() - startTime.getTime()) / 1000
    const sortedAll = allLatencies.sort((a, b) => a - b)

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
      status: this.cancelled ? 'cancelled' : 'completed',
    }

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
      onResponse: (latency: number, statusCode: number, bytes: number) => void
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
      try {
        const { statusCode, bytes } = await this.makeRequest(opts)
        const latency = performance.now() - start
        opts.onResponse(latency, statusCode, bytes)
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
  }): Promise<{ statusCode: number; bytes: number }> {
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

      const req = mod.request(reqOptions, (res) => {
        let bytes = 0
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length
        })
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, bytes })
        })
        res.on('error', reject)
      })

      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Request timeout'))
      })

      const abortHandler = () => {
        req.destroy()
        reject(new Error('Cancelled'))
      }
      opts.signal.addEventListener('abort', abortHandler, { once: true })

      if (opts.config.body && opts.config.method !== 'GET') {
        req.write(opts.config.body)
      }
      req.end()
    })
  }

  cancel(): void {
    this.cancelled = true
    this.abortController?.abort()
  }
}
