import { useTestStore } from '@/stores/test-store'
import {
  StopCircle,
  Activity,
  Clock,
  AlertTriangle,
  Gauge,
} from 'lucide-react'
import { MetricsChart } from '@/components/MetricsChart'
import type { ReactNode } from 'react'

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function TestProgress() {
  const progress = useTestStore((s) => s.progress)
  const timeline = useTestStore((s) => s.timeline)
  const config = useTestStore((s) => s.config)

  const handleCancel = async () => {
    await window.stressflow.test.cancel()
  }

  const percentage = progress
    ? Math.min(
        100,
        Math.round((progress.currentSecond / progress.totalSeconds) * 100)
      )
    : 0

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-sf-text flex items-center gap-2">
            <Activity className="w-5 h-5 text-sf-accent animate-pulse-glow" />
            Teste em Execução
          </h2>
          <p className="text-sm text-sf-textSecondary mt-1">{config.url}</p>
        </div>
        <button
          onClick={handleCancel}
          className="flex items-center gap-2 px-4 py-2 bg-sf-danger/10 text-sf-danger border border-sf-danger/30 rounded-lg hover:bg-sf-danger/20 transition-all"
        >
          <StopCircle className="w-4 h-4" />
          Cancelar
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-sf-textSecondary flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Progresso
          </span>
          <span className="text-sf-text font-mono">
            {progress?.currentSecond || 0}s / {config.duration}s ({percentage}%)
          </span>
        </div>
        <div className="h-3 bg-sf-surface rounded-full overflow-hidden border border-sf-border">
          <div
            className="h-full bg-gradient-to-r from-sf-primary to-sf-accent rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Live metrics */}
      {progress && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <MetricCard
            icon={<Gauge className="w-4 h-4" />}
            label="RPS"
            value={String(progress.cumulative.rps)}
            color="text-sf-primary"
          />
          <MetricCard
            icon={<Activity className="w-4 h-4" />}
            label="Latência P95"
            value={formatMs(progress.metrics.latencyP95)}
            color="text-sf-accent"
          />
          <MetricCard
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Taxa de Erro"
            value={`${
              progress.cumulative.totalRequests > 0
                ? (
                    (progress.cumulative.totalErrors /
                      progress.cumulative.totalRequests) *
                    100
                  ).toFixed(1)
                : '0'
            }%`}
            color={
              progress.cumulative.totalErrors > 0
                ? 'text-sf-danger'
                : 'text-sf-success'
            }
          />
          <MetricCard
            icon={<Activity className="w-4 h-4" />}
            label="Total Requests"
            value={progress.cumulative.totalRequests.toLocaleString('pt-BR')}
            color="text-sf-text"
          />
        </div>
      )}

      {/* Live charts */}
      {timeline.length > 1 && (
        <div className="space-y-4">
          <MetricsChart
            title="Requests por Segundo"
            data={timeline}
            dataKey="requests"
            color="#6366f1"
            id="rps-chart"
          />
          <MetricsChart
            title="Latência (ms)"
            data={timeline}
            lines={[
              { key: 'latencyP50', color: '#22c55e', label: 'P50' },
              { key: 'latencyP95', color: '#f59e0b', label: 'P95' },
              { key: 'latencyP99', color: '#ef4444', label: 'P99' },
            ]}
            id="latency-chart"
          />
          <MetricsChart
            title="Erros por Segundo"
            data={timeline}
            dataKey="errors"
            color="#ef4444"
            id="errors-chart"
          />
        </div>
      )}
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
      <div className={`flex items-center gap-1.5 text-xs ${color} mb-1`}>
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold text-sf-text font-mono">{value}</div>
    </div>
  )
}
