import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  FileText,
  RotateCcw,
  Check,
  X,
  Gauge,
  Clock,
  AlertTriangle,
  FileJson,
} from 'lucide-react'
import { useTestStore } from '@/stores/test-store'
import { MetricsChart } from '@/components/MetricsChart'
import { generatePDF } from '@/services/pdf-generator'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toPng } from 'html-to-image'
import type { TestResult } from '@/types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function getHealthInfo(result: TestResult): {
  score: number
  label: string
  color: string
  bg: string
  border: string
} {
  let score = 100
  if (result.errorRate > 50) score -= 40
  else if (result.errorRate > 20) score -= 30
  else if (result.errorRate > 5) score -= 20
  else if (result.errorRate > 1) score -= 10
  if (result.latency.p95 > 10000) score -= 30
  else if (result.latency.p95 > 5000) score -= 20
  else if (result.latency.p95 > 2000) score -= 15
  else if (result.latency.p95 > 1000) score -= 10
  else if (result.latency.p95 > 500) score -= 5
  const disparity =
    result.latency.p50 > 0 ? result.latency.p99 / result.latency.p50 : 1
  if (disparity > 20) score -= 15
  else if (disparity > 10) score -= 10
  else if (disparity > 5) score -= 5
  score = Math.max(0, Math.min(100, score))

  if (score >= 80)
    return {
      score,
      label: 'Excelente',
      color: 'text-sf-success',
      bg: 'bg-sf-success/10',
      border: 'border-sf-success/30',
    }
  if (score >= 60)
    return {
      score,
      label: 'Bom',
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
      border: 'border-blue-400/30',
    }
  if (score >= 40)
    return {
      score,
      label: 'Regular',
      color: 'text-sf-warning',
      bg: 'bg-sf-warning/10',
      border: 'border-sf-warning/30',
    }
  return {
    score,
    label: 'Crítico',
    color: 'text-sf-danger',
    bg: 'bg-sf-danger/10',
    border: 'border-sf-danger/30',
  }
}

export function TestResults() {
  const currentResult = useTestStore((s) => s.currentResult)
  const timeline = useTestStore((s) => s.timeline)
  const setStatus = useTestStore((s) => s.setStatus)
  const clearProgress = useTestStore((s) => s.clearProgress)
  const setCurrentResult = useTestStore((s) => s.setCurrentResult)
  const setView = useTestStore((s) => s.setView)

  const [exporting, setExporting] = useState(false)

  if (!currentResult) return null

  const result = currentResult
  const displayTimeline =
    result.timeline.length > 0 ? result.timeline : timeline
  const health = getHealthInfo(result)

  const handleExportPDF = async () => {
    setExporting(true)
    try {
      const chartImages: {
        rps?: string
        latency?: string
        errors?: string
      } = {}

      const rpsEl = document.getElementById('rps-chart-result')
      const latencyEl = document.getElementById('latency-chart-result')
      const errorsEl = document.getElementById('errors-chart-result')

      if (rpsEl) {
        try {
          chartImages.rps = await toPng(rpsEl, {
            backgroundColor: '#1a1d27',
          })
        } catch {
          /* skip */
        }
      }
      if (latencyEl) {
        try {
          chartImages.latency = await toPng(latencyEl, {
            backgroundColor: '#1a1d27',
          })
        } catch {
          /* skip */
        }
      }
      if (errorsEl) {
        try {
          chartImages.errors = await toPng(errorsEl, {
            backgroundColor: '#1a1d27',
          })
        } catch {
          /* skip */
        }
      }

      const base64 = await generatePDF(result, chartImages)
      const filename = `stressflow-report-${format(new Date(result.startTime), 'yyyy-MM-dd-HHmmss')}.pdf`
      const filePath = await window.stressflow.pdf.save(base64, filename)
      await window.stressflow.pdf.open(filePath)
    } catch {
      /* PDF generation failed silently */
    } finally {
      setExporting(false)
    }
  }

  const handleExportJSON = async () => {
    const filename = `stressflow-result-${format(new Date(result.startTime), 'yyyy-MM-dd-HHmmss')}.json`
    await window.stressflow.json.export(
      JSON.stringify(result, null, 2),
      filename
    )
  }

  const handleNewTest = () => {
    setStatus('idle')
    clearProgress()
    setCurrentResult(null)
    setView('test')
  }

  return (
    <div className="animate-slide-up space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-sf-text flex items-center gap-2">
            {result.status === 'completed' ? (
              <Check className="w-5 h-5 text-sf-success" />
            ) : (
              <X className="w-5 h-5 text-sf-warning" />
            )}
            Teste {result.status === 'completed' ? 'Concluído' : 'Cancelado'}
          </h2>
          <p className="text-sm text-sf-textSecondary mt-1">
            {result.url} ·{' '}
            {format(new Date(result.startTime), "dd/MM/yyyy 'às' HH:mm", {
              locale: ptBR,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-sf-surface border border-sf-border rounded-lg hover:bg-sf-surfaceHover text-sf-textSecondary transition-all"
          >
            <FileJson className="w-4 h-4" />
            JSON
          </button>
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-sf-primary hover:bg-sf-primaryHover text-white rounded-lg transition-all disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            {exporting ? 'Gerando...' : 'Exportar PDF'}
          </button>
          <button
            onClick={handleNewTest}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-sf-surface border border-sf-border rounded-lg hover:bg-sf-surfaceHover text-sf-textSecondary transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            Novo Teste
          </button>
        </div>
      </div>

      {/* Health Score */}
      <div className={`p-4 rounded-xl border ${health.bg} ${health.border}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-sm font-medium ${health.color}`}>
              Saúde do Site
            </div>
            <div className={`text-3xl font-bold ${health.color} mt-1`}>
              {health.score}/100 — {health.label}
            </div>
          </div>
          <div className={`text-6xl font-bold ${health.color} opacity-20`}>
            {health.score >= 80 ? '✓' : health.score >= 40 ? '!' : '✗'}
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <ResultCard
          icon={<Gauge className="w-4 h-4" />}
          label="Requests/segundo"
          value={result.rps.toLocaleString('pt-BR')}
          subValue={`${result.totalRequests.toLocaleString('pt-BR')} total`}
          color="text-sf-primary"
        />
        <ResultCard
          icon={<Clock className="w-4 h-4" />}
          label="Latência Média"
          value={formatMs(result.latency.avg)}
          subValue={`P95: ${formatMs(result.latency.p95)}`}
          color="text-sf-accent"
        />
        <ResultCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Taxa de Erro"
          value={`${result.errorRate}%`}
          subValue={`${result.totalErrors.toLocaleString('pt-BR')} erros`}
          color={result.errorRate > 5 ? 'text-sf-danger' : 'text-sf-success'}
        />
      </div>

      {/* Latency Breakdown */}
      <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
        <h3 className="text-sm font-medium text-sf-textSecondary mb-3">
          Distribuição de Latência
        </h3>
        <div className="grid grid-cols-6 gap-4">
          {[
            { label: 'Mín', value: result.latency.min },
            { label: 'P50', value: result.latency.p50 },
            { label: 'P90', value: result.latency.p90 },
            { label: 'P95', value: result.latency.p95 },
            { label: 'P99', value: result.latency.p99 },
            { label: 'Máx', value: result.latency.max },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <div className="text-xs text-sf-textMuted mb-1">
                {item.label}
              </div>
              <div className="text-sm font-mono font-medium text-sf-text">
                {formatMs(item.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Status Codes */}
      {Object.keys(result.statusCodes).length > 0 && (
        <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-sf-textSecondary mb-3">
            Status Codes HTTP
          </h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(result.statusCodes)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([code, count]) => {
                const codeNum = Number(code)
                const colorClass =
                  codeNum < 300
                    ? 'text-sf-success bg-sf-success/10'
                    : codeNum < 400
                      ? 'text-blue-400 bg-blue-400/10'
                      : codeNum < 500
                        ? 'text-sf-warning bg-sf-warning/10'
                        : 'text-sf-danger bg-sf-danger/10'
                return (
                  <div key={code} className={`px-3 py-2 rounded-lg ${colorClass}`}>
                    <span className="font-mono font-medium">{code}</span>
                    <span className="ml-2 text-sm opacity-80">
                      {(count as number).toLocaleString('pt-BR')} (
                      {(
                        ((count as number) / result.totalRequests) *
                        100
                      ).toFixed(1)}
                      %)
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Throughput */}
      <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
        <h3 className="text-sm font-medium text-sf-textSecondary mb-2">
          Throughput
        </h3>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-sf-text font-mono">
            {formatBytes(result.throughputBytesPerSec)}/s
          </span>
          <span className="text-sm text-sf-textMuted">
            ({formatBytes(result.totalBytes)} total)
          </span>
        </div>
      </div>

      {/* Charts */}
      {displayTimeline.length > 1 && (
        <div className="space-y-4">
          <MetricsChart
            title="Requests por Segundo"
            data={displayTimeline}
            dataKey="requests"
            color="#6366f1"
            id="rps-chart-result"
          />
          <MetricsChart
            title="Latência (ms)"
            data={displayTimeline}
            lines={[
              { key: 'latencyP50', color: '#22c55e', label: 'P50' },
              { key: 'latencyP95', color: '#f59e0b', label: 'P95' },
              { key: 'latencyP99', color: '#ef4444', label: 'P99' },
            ]}
            id="latency-chart-result"
          />
          <MetricsChart
            title="Erros por Segundo"
            data={displayTimeline}
            dataKey="errors"
            color="#ef4444"
            id="errors-chart-result"
          />
        </div>
      )}

      {/* Config Summary */}
      <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
        <h3 className="text-sm font-medium text-sf-textSecondary mb-3">
          Configuração do Teste
        </h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-sf-textMuted">Método</span>
            <span className="text-sf-text font-mono">
              {result.config.method}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sf-textMuted">Usuários</span>
            <span className="text-sf-text font-mono">
              {result.config.virtualUsers}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sf-textMuted">Duração</span>
            <span className="text-sf-text font-mono">
              {result.config.duration}s
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sf-textMuted">Duração Real</span>
            <span className="text-sf-text font-mono">
              {result.durationSeconds}s
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResultCard({
  icon,
  label,
  value,
  subValue,
  color,
}: {
  icon: ReactNode
  label: string
  value: string
  subValue: string
  color: string
}) {
  return (
    <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
      <div className={`flex items-center gap-1.5 text-xs ${color} mb-1`}>
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-sf-text font-mono">{value}</div>
      <div className="text-xs text-sf-textMuted mt-1">{subValue}</div>
    </div>
  )
}
