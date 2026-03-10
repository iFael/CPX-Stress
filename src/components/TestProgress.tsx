/**
 * TestProgress.tsx
 *
 * Painel ao vivo exibido enquanto o teste de estresse está rodando.
 * Mostra barra de progresso, metricas em tempo real e graficos de acompanhamento.
 *
 * -- Glossario rapido (para quem nao e tecnico) --
 *  RPS          = Requests Por Segundo — quantas requisicoes o servidor atende por segundo.
 *  Latencia     = Tempo que o servidor demora para responder a cada requisicao.
 *  P95          = Percentil 95 — 95% das requisicoes foram mais rapidas que esse valor.
 *  Taxa de Erro = Porcentagem de requisicoes que falharam.
 */

import { useCallback, useMemo, memo } from 'react'
import type { ReactNode } from 'react'
import {
  StopCircle,
  Activity,
  Clock,
  AlertTriangle,
  Gauge,
  Users,
  TrendingUp,
  Heart,
} from 'lucide-react'
import { useTestStore } from '@/stores/test-store'
import { MetricsChart } from '@/components/MetricsChart'
import { InfoTooltip } from '@/components/InfoTooltip'
import { METRIC_EXPLANATIONS } from '@/components/results-constants'

// ---------------------------------------------------------------------------
// Utilitarios de formatacao
// ---------------------------------------------------------------------------

/** Converte milissegundos para uma string legivel (ex: 120ms, 1.50s) */
function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}\u03bcs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/** Formata segundos restantes em "Xmin Ys" ou "Xs" */
function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'finalizando...'
  if (seconds < 60) return `${seconds}s restantes`
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${min}min ${sec}s restantes`
}

// ---------------------------------------------------------------------------
// Avaliacao em tempo real — classifica a saude do servidor enquanto o teste roda
// ---------------------------------------------------------------------------

/**
 * Retorna um "semaforo" de saude baseado na taxa de erro e latencia atuais.
 * Isso ajuda o usuario a entender rapidamente se o servidor esta aguentando.
 */
interface LiveHealthStatus {
  label: string
  color: string
  bgColor: string
  borderColor: string
  description: string
}

function getLiveHealthStatus(
  errorRate: number,
  latencyP95: number
): LiveHealthStatus {
  // Servidor falhando muito — situacao critica
  if (errorRate > 20 || latencyP95 > 10000) {
    return {
      label: 'Critico',
      color: 'text-sf-danger',
      bgColor: 'bg-sf-danger/10',
      borderColor: 'border-sf-danger/30',
      description: 'O servidor esta com dificuldades serias para responder.',
    }
  }

  // Alguns erros ou lentidao perceptivel — merece atencao
  if (errorRate > 5 || latencyP95 > 3000) {
    return {
      label: 'Degradado',
      color: 'text-sf-warning',
      bgColor: 'bg-sf-warning/10',
      borderColor: 'border-sf-warning/30',
      description: 'O servidor esta respondendo, mas com lentidao ou falhas.',
    }
  }

  // Tudo fluindo bem
  return {
    label: 'Saudavel',
    color: 'text-sf-success',
    bgColor: 'bg-sf-success/10',
    borderColor: 'border-sf-success/30',
    description: 'O servidor esta respondendo bem a carga aplicada.',
  }
}

// ---------------------------------------------------------------------------
// Componente principal — Painel de progresso do teste
// ---------------------------------------------------------------------------

export function TestProgress() {
  // Estado global: dados de progresso, historico de metricas e configuracao
  const progress = useTestStore((s) => s.progress)
  const timeline = useTestStore((s) => s.timeline)
  const config = useTestStore((s) => s.config)

  // Otimizacao: useCallback garante referencia estavel para o handler de cancelamento.
  // Sem isso, uma nova funcao e criada a cada re-render (a cada segundo durante o teste),
  // causando re-render desnecessario no botao de cancelar.
  const handleCancel = useCallback(async () => {
    try {
      await window.stressflow.test.cancel()
    } catch (err) {
      console.warn('[StressFlow] Falha ao cancelar teste:', err)
    }
  }, [])

  // Otimizacao: useMemo para calculos derivados que dependem de progress e config.
  // Sem memoizacao, esses calculos (incluindo getLiveHealthStatus que aloca objetos)
  // rodam em cada re-render. Agrupados em um unico useMemo para evitar overhead
  // de multiplos hooks e manter o codigo coeso.
  const { currentSecond, totalSeconds, percentage, secondsRemaining, errorRate, liveHealth, barStyle } =
    useMemo(() => {
      const _currentSecond = progress?.currentSecond ?? 0
      const _totalSeconds = progress?.totalSeconds ?? config.duration
      const _percentage = _totalSeconds > 0
        ? Math.min(100, Math.round((_currentSecond / _totalSeconds) * 100))
        : 0
      const _secondsRemaining = _totalSeconds - _currentSecond

      const _errorRate =
        progress && progress.cumulative.totalRequests > 0
          ? (progress.cumulative.totalErrors / progress.cumulative.totalRequests) * 100
          : 0

      const _liveHealth = progress
        ? getLiveHealthStatus(_errorRate, progress.metrics.latencyP95)
        : null

      return {
        currentSecond: _currentSecond,
        totalSeconds: _totalSeconds,
        percentage: _percentage,
        secondsRemaining: _secondsRemaining,
        errorRate: _errorRate,
        liveHealth: _liveHealth,
        // Estilo memoizado para a largura da barra de progresso.
        // Nao e possivel usar classe Tailwind pura aqui porque o valor e dinamico (0-100%).
        barStyle: { width: `${_percentage}%` } as const,
      }
    }, [progress, config.duration])

  // ---------------------------------------------------------------------------
  // Renderizacao
  // ---------------------------------------------------------------------------
  return (
    <div className="animate-slide-up" role="region" aria-label="Painel de progresso do teste em execucao">

      {/* ===== Cabecalho: titulo + URL + botao de cancelar ===== */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-sf-text flex items-center gap-2">
            <Activity className="w-5 h-5 text-sf-accent animate-pulse-glow" aria-hidden="true" />
            Teste em Execucao
          </h2>
          <p className="text-sm text-sf-textSecondary mt-1 flex items-center gap-2">
            {config.url}
            {/* Indicador de "ao vivo" — pontinho pulsante */}
            <span
              className="inline-flex items-center gap-1 text-xs text-sf-accent"
              role="status"
              aria-live="polite"
              aria-label="Teste ao vivo em andamento"
            >
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sf-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sf-accent" />
              </span>
              ao vivo
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          aria-label="Cancelar teste em execucao (atalho: Escape)"
          className="flex items-center gap-2 px-4 py-2 bg-sf-danger/10 text-sf-danger border border-sf-danger/30 rounded-lg hover:bg-sf-danger/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-danger focus-visible:ring-offset-1"
        >
          <StopCircle className="w-4 h-4" aria-hidden="true" />
          Cancelar
          <kbd className="text-xs opacity-60 font-normal" aria-hidden="true">Esc</kbd>
        </button>
      </div>

      {/* ===== Barra de progresso com tempo restante ===== */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-sf-textSecondary flex items-center gap-1.5">
            <Clock className="w-4 h-4" aria-hidden="true" />
            Progresso
            <InfoTooltip text="Indica quanto do tempo total do teste ja foi executado. O teste dispara requisicoes continuamente ate o tempo acabar." />
          </span>
          <div className="flex items-center gap-3">
            {/* Tempo restante estimado */}
            <span className="text-sf-textMuted text-xs">
              {formatTimeRemaining(secondsRemaining)}
            </span>
            {/* Contagem atual / total */}
            <span className="text-sf-text font-mono">
              {currentSecond}s / {totalSeconds}s ({percentage}%)
            </span>
          </div>
        </div>
        {/* Barra visual */}
        <div
          className="h-3 bg-sf-surface rounded-full overflow-hidden border border-sf-border"
          role="progressbar"
          aria-valuenow={Number(percentage)}
          aria-valuemin={Number(0)}
          aria-valuemax={Number(100)}
          aria-label={`Progresso do teste: ${percentage}% concluido, ${formatTimeRemaining(secondsRemaining)}`}
        >
          <div
            className="h-full bg-gradient-to-r from-sf-primary to-sf-accent rounded-full transition-all duration-500 ease-out relative"
            style={barStyle}
          >
            {/* Efeito de brilho na ponta da barra */}
            {percentage > 0 && percentage < 100 && (
              <div className="absolute right-0 top-0 h-full w-4 bg-gradient-to-r from-transparent to-white/20 animate-pulse" />
            )}
          </div>
        </div>
        {/* Marcadores de 25%, 50%, 75% para referencia visual */}
        <div className="flex justify-between mt-1 px-0.5">
          {[0, 25, 50, 75, 100].map((mark) => (
            <span
              key={mark}
              className={`text-[10px] ${
                percentage >= mark ? 'text-sf-textSecondary' : 'text-sf-textMuted/40'
              }`}
            >
              {mark}%
            </span>
          ))}
        </div>
      </div>

      {/* ===== Indicador de saude em tempo real ===== */}
      {/* Mostra ao usuario se o servidor esta aguentando a carga ou se ja esta degradando */}
      {liveHealth && (
        <div
          className={`flex items-center gap-3 mb-6 p-3 rounded-xl border ${liveHealth.bgColor} ${liveHealth.borderColor}`}
          role="status"
          aria-live="polite"
          aria-label={`Saude do servidor: ${liveHealth.label}. ${liveHealth.description}`}
        >
          <Heart className={`w-4 h-4 ${liveHealth.color} shrink-0`} aria-hidden="true" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className={`text-sm font-semibold ${liveHealth.color}`}>
              {liveHealth.label}
            </span>
            <span className="text-xs text-sf-textSecondary truncate">
              {liveHealth.description}
            </span>
          </div>
        </div>
      )}

      {/* ===== Metricas ao vivo — cartoes com valores atualizados a cada segundo ===== */}
      {progress && (
        <div
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"
          role="region"
          aria-label="Metricas do teste em tempo real"
        >

          {/* Capacidade de atendimento (RPS) */}
          <LiveMetricCard
            icon={<Gauge className="w-4 h-4" />}
            label="Capacidade"
            sublabel="Requests/segundo"
            tooltip={METRIC_EXPLANATIONS.rps}
            value={String(progress.cumulative.rps)}
            color="text-sf-primary"
          />

          {/* Tempo de resposta (P95) */}
          <LiveMetricCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="Tempo de Resposta"
            sublabel="Latencia P95"
            tooltip={METRIC_EXPLANATIONS.latencyP95}
            value={formatMs(progress.metrics.latencyP95)}
            color="text-sf-accent"
          />

          {/* Taxa de erro acumulada */}
          <LiveMetricCard
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Falhas"
            sublabel="Taxa de erro"
            tooltip={METRIC_EXPLANATIONS.errorRate}
            value={`${errorRate.toFixed(1)}%`}
            color={errorRate > 5 ? 'text-sf-danger' : errorRate > 1 ? 'text-sf-warning' : 'text-sf-success'}
          />

          {/* Total de requisicoes enviadas ate agora */}
          <LiveMetricCard
            icon={<Users className="w-4 h-4" />}
            label="Requisicoes"
            sublabel="Total enviado"
            tooltip="Quantidade total de requisicoes que ja foram enviadas ao servidor desde o inicio do teste."
            value={progress.cumulative.totalRequests.toLocaleString('pt-BR')}
            color="text-sf-text"
          />
        </div>
      )}

      {/* ===== Graficos em tempo real ===== */}
      {/* Os graficos so aparecem apos pelo menos 2 segundos de dados (para ter pontos suficientes) */}
      {timeline.length > 1 && (
        <div className="space-y-4" role="region" aria-label="Graficos de metricas em tempo real">
          {/* Quantas requisicoes o servidor processou a cada segundo */}
          <MetricsChart
            title="Requests por Segundo"
            data={timeline}
            dataKey="requests"
            color="#6366f1"
            id="rps-chart"
            animated={false}
          />

          {/* Tempo de resposta do servidor ao longo do teste (multiplos percentis) */}
          <MetricsChart
            title="Latencia (ms)"
            data={timeline}
            lines={[
              { key: 'latencyP50', color: '#22c55e', label: 'P50 (tipico)' },
              { key: 'latencyP95', color: '#f59e0b', label: 'P95 (lento)' },
              { key: 'latencyP99', color: '#ef4444', label: 'P99 (muito lento)' },
            ]}
            id="latency-chart"
            animated={false}
          />

          {/* Quantidade de erros a cada segundo — idealmente esse grafico fica em zero */}
          <MetricsChart
            title="Erros por Segundo"
            data={timeline}
            dataKey="errors"
            color="#ef4444"
            id="errors-chart"
            animated={false}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponente — Cartao de metrica ao vivo
// ---------------------------------------------------------------------------

/**
 * Exibe uma metrica individual com icone, label explicativo, tooltip e valor.
 * Usado nos 4 cartoes de metricas na parte superior do painel.
 */
interface LiveMetricCardProps {
  icon: ReactNode
  label: string
  sublabel: string
  tooltip: string
  value: string
  color: string
}

// Otimizacao: React.memo impede que LiveMetricCard re-renderize quando suas
// props nao mudaram. Durante o teste ao vivo, o componente pai re-renderiza
// a cada segundo, mas nem sempre todas as 4 metricas mudam simultaneamente.
// Sem memo, os 4 cartoes seriam recriados a cada tick, incluindo os icones
// e InfoTooltip internos (que sao estaticos).
const LiveMetricCard = memo(function LiveMetricCard({ icon, label, sublabel, tooltip, value, color }: LiveMetricCardProps) {
  return (
    <div
      className="bg-sf-surface border border-sf-border rounded-xl p-4 transition-colors"
      role="group"
      aria-label={`${label}: ${value}`}
    >
      {/* Cabecalho: icone + nome da metrica + tooltip de ajuda */}
      <div className={`flex items-center gap-1.5 text-xs ${color} mb-0.5`}>
        <span aria-hidden="true">{icon}</span>
        {label}
        <InfoTooltip text={tooltip} />
      </div>
      {/* Sub-rotulo tecnico em texto menor */}
      <div className="text-[10px] text-sf-textMuted mb-1">{sublabel}</div>
      {/* Valor principal em destaque */}
      <div className="text-xl font-bold text-sf-text font-mono">{value}</div>
    </div>
  )
})
