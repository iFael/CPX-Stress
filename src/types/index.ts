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

export type AppView = 'test' | 'history' | 'results'

export type TestStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error'

declare global {
  interface Window {
    stressflow: {
      test: {
        start: (config: TestConfig) => Promise<TestResult>
        cancel: () => Promise<boolean>
        onProgress: (callback: (data: ProgressData) => void) => () => void
      }
      history: {
        list: () => Promise<TestResult[]>
        get: (id: string) => Promise<TestResult | null>
        delete: (id: string) => Promise<boolean>
        clear: () => Promise<boolean>
      }
      pdf: {
        save: (base64: string, filename: string) => Promise<string>
        open: (filePath: string) => Promise<void>
      }
      json: {
        export: (data: string, defaultName: string) => Promise<string | null>
      }
      app: {
        getPath: () => Promise<string>
      }
    }
  }
}
