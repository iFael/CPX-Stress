// =============================================================================
// TestResults.tsx — Tela de Resultados do Teste de Estresse
// =============================================================================
//
// Este arquivo contém o componente principal que exibe os resultados após um
// teste de estresse ser concluído. Ele mostra:
//
//   - Nota de saúde do site (0 a 100)
//   - Métricas principais (velocidade, erros, capacidade)
//   - Gráficos de desempenho ao longo do tempo
//   - Recomendações automáticas baseadas nos resultados
//
// Glossário para leitura do código:
//   - "health score" = nota de saúde (0-100)
//   - "latency" / "latência" = tempo de resposta do servidor
//   - "throughput" = volume de dados transferidos por segundo
//   - "RPS" = requisições por segundo = capacidade de atendimento
//   - "P50/P95/P99" = percentis de latência
//       ex: P95 = 95% dos acessos responderam nesse tempo ou menos
//   - "error rate" = taxa de erro = percentual de requisições que falharam
// =============================================================================

import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react'
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
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Loader2,
  Zap,
} from 'lucide-react'
import { useTestStore } from '@/stores/test-store'
import { MetricsChart } from '@/components/MetricsChart'
import { ProtectionReportSection } from '@/components/ProtectionReport'
import { ResultsSummary } from '@/components/ResultsSummary'
import { InfoTooltip } from '@/components/InfoTooltip'
import {
  METRIC_EXPLANATIONS,
  STATUS_CODE_LABELS,
  HEALTH_EXPLANATIONS,
} from '@/components/results-constants'
import { generatePDF } from '@/services/pdf-generator'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toPng } from 'html-to-image'
import type { TestResult } from '@/types'

// =============================================================================
// Funções Utilitárias de Formatação
// =============================================================================

/** Converte bytes para formato legível (ex: 1024 -> "1.00 KB") */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

/** Converte milissegundos para formato legível (ex: 1500 -> "1.50s") */
function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// =============================================================================
// Avaliação de Qualidade das Métricas
// =============================================================================
//
// Essas funções avaliam se os valores de cada métrica são bons ou ruins,
// retornando indicadores visuais (cor e rótulo) para facilitar a leitura.
//
// São usadas nos cards de métricas para mostrar badges como "Rápido" (verde)
// ou "Crítico" (vermelho), ajudando leigos a interpretar os números.
// =============================================================================

/** Informações visuais de qualidade de uma métrica */
interface QualityInfo {
  label: string
  color: string
  bgColor: string
}

/**
 * Avalia a qualidade do tempo de resposta médio.
 * Quanto menor o tempo, melhor — sites rápidos respondem em menos de 200ms.
 *
 * Faixas:
 *   < 200ms   = Rápido (verde)
 *   < 500ms   = Bom (azul)
 *   < 1000ms  = Lento (amarelo)
 *   >= 1000ms = Muito Lento (vermelho)
 */
function getLatencyQuality(avgMs: number): QualityInfo {
  if (avgMs < 200)
    return { label: 'Rápido', color: 'text-sf-success', bgColor: 'bg-sf-success/15' }
  if (avgMs < 500)
    return { label: 'Bom', color: 'text-blue-400', bgColor: 'bg-blue-400/15' }
  if (avgMs < 1000)
    return { label: 'Lento', color: 'text-sf-warning', bgColor: 'bg-sf-warning/15' }
  return { label: 'Muito Lento', color: 'text-sf-danger', bgColor: 'bg-sf-danger/15' }
}

/**
 * Avalia a qualidade da taxa de erros.
 * O ideal é 0% — acima de 5% indica problemas sérios.
 *
 * Faixas:
 *   0%   = Sem Erros (verde)
 *   < 1% = Baixo (azul)
 *   < 5% = Atenção (amarelo)
 *   >= 5% = Crítico (vermelho)
 */
function getErrorRateQuality(errorRate: number): QualityInfo {
  if (errorRate === 0)
    return { label: 'Sem Erros', color: 'text-sf-success', bgColor: 'bg-sf-success/15' }
  if (errorRate < 1)
    return { label: 'Baixo', color: 'text-blue-400', bgColor: 'bg-blue-400/15' }
  if (errorRate < 5)
    return { label: 'Atenção', color: 'text-sf-warning', bgColor: 'bg-sf-warning/15' }
  return { label: 'Crítico', color: 'text-sf-danger', bgColor: 'bg-sf-danger/15' }
}

/**
 * Retorna a cor adequada para um valor de latência individual.
 * Usado na tabela de percentis para colorir cada valor conforme a qualidade.
 */
function getLatencyValueColor(ms: number): string {
  if (ms < 200) return 'text-sf-success'
  if (ms < 500) return 'text-blue-400'
  if (ms < 1500) return 'text-sf-warning'
  return 'text-sf-danger'
}

// =============================================================================
// Cálculo da Nota de Saúde (Health Score)
// =============================================================================
//
// A nota de saúde é calculada de 0 a 100, onde:
//   100 = perfeito (sem erros, rápido, estável)
//     0 = crítico (muitas falhas, inacessível)
//
// Fatores que reduzem a nota:
//   - Alta taxa de erros de conexão
//   - Bloqueios HTTP (403, 429, 5xx)
//   - Tempo de resposta alto (latência P95)
//   - Inconsistência nos tempos (P99 muito maior que P50)
//   - Servidor não enviando dados (zero throughput)
//
// Esta função é centralizada para evitar duplicação — todos os componentes
// que precisam da nota de saúde chamam esta mesma função.
// =============================================================================

/** Calcula a nota numérica de saúde (0-100) a partir dos resultados do teste */
function calculateHealthScore(result: TestResult): number {
  // Taxa de erro HTTP (403/429/5xx) — indica proteção bloqueando requests
  const httpErrorCount = Object.entries(result.statusCodes || {})
    .filter(([code]) => code === '403' || code === '429' || Number(code) >= 500)
    .reduce((sum, [, count]) => sum + count, 0)
  const httpErrorRate =
    result.totalRequests > 0
      ? (httpErrorCount / result.totalRequests) * 100
      : 0

  // Caso extremo: falha total de conexão (todos os requests falharam)
  if (
    result.errorRate >= 95 ||
    (result.totalRequests === result.totalErrors && result.latency.avg === 0)
  ) {
    return 0
  }

  // Caso extremo: bloqueio quase total via HTTP (WAF/rate-limiter)
  if (httpErrorRate >= 90) {
    return 5
  }

  // Inicia com nota máxima e desconta conforme problemas encontrados
  let score = 100

  // Desconto por taxa de erros de conexão
  if (result.errorRate > 50) score -= 60
  else if (result.errorRate > 20) score -= 40
  else if (result.errorRate > 5) score -= 25
  else if (result.errorRate > 1) score -= 15
  else if (result.errorRate > 0.5) score -= 5

  // Desconto por respostas HTTP de erro (proteção/WAF bloqueando)
  if (httpErrorRate > 50) score -= 40
  else if (httpErrorRate > 20) score -= 25
  else if (httpErrorRate > 5) score -= 10

  // Desconto se o servidor não enviou nenhum dado (zero throughput)
  if (result.totalBytes === 0 && result.totalRequests > 0) score -= 30

  // Desconto por tempo de resposta alto (P95 = tempo dos 5% mais lentos)
  if (result.latency.p95 > 10000) score -= 30
  else if (result.latency.p95 > 5000) score -= 20
  else if (result.latency.p95 > 2000) score -= 15
  else if (result.latency.p95 > 1000) score -= 10
  else if (result.latency.p95 > 500) score -= 5

  // Desconto por inconsistência (P99 muito maior que P50 indica instabilidade)
  const disparity =
    result.latency.p50 > 0 ? result.latency.p99 / result.latency.p50 : 1
  if (disparity > 20) score -= 15
  else if (disparity > 10) score -= 10
  else if (disparity > 5) score -= 5

  return Math.max(0, Math.min(100, score))
}

/** Informações visuais da saúde do site (nota, cor, rótulo, fundo) */
interface HealthInfo {
  score: number
  label: string
  color: string
  bg: string
  border: string
}

/**
 * Retorna a nota de saúde com informações visuais (cor, rótulo, fundo).
 *
 * Faixas:
 *   80-100 = Excelente (verde)
 *   60-79  = Bom (azul)
 *   40-59  = Regular (amarelo)
 *   0-39   = Crítico (vermelho)
 */
function getHealthInfo(result: TestResult): HealthInfo {
  const score = calculateHealthScore(result)

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

// =============================================================================
// Cálculo de Saúde Pré-Bloqueio
// =============================================================================
//
// Quando o sistema de proteção do site (WAF, rate-limiter) bloqueia as
// requisições em um certo momento, os dados após o bloqueio ficam distorcidos.
// Esta função calcula a nota de saúde usando apenas os dados ANTES do bloqueio,
// dando uma visão mais precisa do desempenho real do servidor.
// =============================================================================

function getPreBlockingHealth(result: TestResult): {
  score: HealthInfo
  blockSecond: number
} | null {
  const report = result.protectionReport
  if (!report) return null

  // Procura o momento exato em que a proteção começou a bloquear
  const blockingPattern = report.behavioralPatterns.find(
    (p) => p.type === 'blocking' && p.startSecond !== undefined
  )
  if (!blockingPattern || blockingPattern.startSecond === undefined) return null

  const blockSecond = blockingPattern.startSecond

  // Filtra apenas os dados dos segundos anteriores ao bloqueio
  const preBlock = result.timeline.filter((s) => s.second < blockSecond)
  if (preBlock.length < 2) return null

  // Agrega as métricas do período pré-bloqueio
  const totalReqs = preBlock.reduce((sum, s) => sum + s.requests, 0)
  const totalErrs = preBlock.reduce((sum, s) => sum + s.errors, 0)
  const errorRate =
    totalReqs > 0 ? Math.round((totalErrs / totalReqs) * 10000) / 100 : 0
  const totalBytes = preBlock.reduce((sum, s) => sum + s.bytesReceived, 0)
  const safeTotalReqs = Math.max(totalReqs, 1)

  // Calcula latência média ponderada pelo número de requests de cada segundo
  const p50 =
    preBlock.reduce((sum, s) => sum + s.latencyP50 * s.requests, 0) /
    safeTotalReqs
  const p90 =
    preBlock.reduce((sum, s) => sum + s.latencyP90 * s.requests, 0) /
    safeTotalReqs
  const p95 =
    preBlock.reduce((sum, s) => sum + s.latencyP95 * s.requests, 0) /
    safeTotalReqs
  const p99 =
    preBlock.reduce((sum, s) => sum + s.latencyP99 * s.requests, 0) /
    safeTotalReqs
  const avg =
    preBlock.reduce((sum, s) => sum + s.latencyAvg * s.requests, 0) /
    safeTotalReqs

  // Min e max consideram apenas segundos que tiveram requests
  const nonEmpty = preBlock.filter((s) => s.requests > 0)
  const min =
    nonEmpty.length > 0 ? Math.min(...nonEmpty.map((s) => s.latencyMin)) : 0
  const max =
    nonEmpty.length > 0 ? Math.max(...nonEmpty.map((s) => s.latencyMax)) : 0

  // Agrega os códigos de status HTTP do período pré-bloqueio
  const preStatusCodes: Record<string, number> = {}
  for (const s of preBlock) {
    for (const [code, count] of Object.entries(s.statusCodes)) {
      preStatusCodes[code] = (preStatusCodes[code] || 0) + count
    }
  }

  // Cria um resultado sintético com dados pré-bloqueio para calcular a nota
  const synthetic: TestResult = {
    ...result,
    errorRate,
    totalBytes,
    totalRequests: totalReqs,
    totalErrors: totalErrs,
    statusCodes: preStatusCodes,
    latency: { avg, min, p50, p90, p95, p99, max },
  }

  return { score: getHealthInfo(synthetic), blockSecond }
}

// =============================================================================
// Utilitário de Captura de Gráficos para PDF
// =============================================================================

/** Captura um elemento HTML como imagem PNG (usado na exportação PDF) */
async function captureChartImage(
  elementId: string
): Promise<string | undefined> {
  const element = document.getElementById(elementId)
  if (!element) return undefined
  try {
    return await toPng(element, { backgroundColor: '#1a1d27' })
  } catch {
    return undefined
  }
}

// =============================================================================
// Componente Principal: TestResults
// =============================================================================
//
// Este é o componente que monta a tela inteira de resultados.
// Ele orquestra todos os subcomponentes e calcula as métricas de qualidade.
// =============================================================================

export function TestResults() {
  // ---- Estado global da aplicação (Zustand store) ----
  const currentResult = useTestStore((s) => s.currentResult)
  const timeline = useTestStore((s) => s.timeline)
  const setStatus = useTestStore((s) => s.setStatus)
  const clearProgress = useTestStore((s) => s.clearProgress)
  const setCurrentResult = useTestStore((s) => s.setCurrentResult)
  const setView = useTestStore((s) => s.setView)
  const setError = useTestStore((s) => s.setError)

  // ---- Estado local do componente ----
  const [exporting, setExporting] = useState(false)
  const [showLatencyDetail, setShowLatencyDetail] = useState(false)
  const [showConfigDetail, setShowConfigDetail] = useState(false)

  /** Volta para a tela de configuração para iniciar um novo teste */
  const handleNewTest = useCallback(() => {
    setStatus('idle')
    clearProgress()
    setCurrentResult(null)
    setView('test')
  }, [setStatus, clearProgress, setCurrentResult, setView])

  // ---------------------------------------------------------------------------
  // Estado vazio: quando não há resultado para exibir
  // Mostra uma mensagem amigável com botão para iniciar um novo teste
  // ---------------------------------------------------------------------------

  if (!currentResult) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-slide-up">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sf-surface border border-sf-border mb-4">
          <Zap className="w-8 h-8 text-sf-textMuted" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-medium text-sf-text mb-2">
          Nenhum resultado disponível
        </h3>
        <p className="text-sm text-sf-textSecondary text-center max-w-sm mb-4">
          Execute um teste de estresse para ver os resultados detalhados aqui,
          ou selecione um teste do histórico.
        </p>
        <button
          type="button"
          onClick={handleNewTest}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-sf-primary hover:bg-sf-primaryHover text-white rounded-lg transition-all"
        >
          <Zap className="w-4 h-4" aria-hidden="true" />
          Iniciar um teste
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Preparação dos dados para renderização
  // ---------------------------------------------------------------------------

  const result = currentResult

  // Usa timeline do resultado salvo, ou a timeline em tempo real como fallback.
  // useMemo evita recriar a referência do array a cada re-render, impedindo
  // que os 3 componentes MetricsChart re-renderizem sem necessidade.
  const displayTimeline = useMemo(
    () => (result.timeline.length > 0 ? result.timeline : timeline),
    [result.timeline, timeline]
  )

  // Memoiza cálculos de saúde — envolvem iteração sobre statusCodes, timeline
  // completa, múltiplos reduce e filtros. Sem memoização, cada mudança de
  // estado local (ex: expandir/colapsar seções) recalcularia tudo.
  const health = useMemo(() => getHealthInfo(result), [result])
  const preBlockHealth = useMemo(() => getPreBlockingHealth(result), [result])

  // Avaliação de qualidade das métricas individuais (para badges nos cards)
  const latencyQuality = useMemo(
    () => getLatencyQuality(result.latency.avg),
    [result.latency.avg]
  )
  const errorQuality = useMemo(
    () => getErrorRateQuality(result.errorRate),
    [result.errorRate]
  )

  // ---------------------------------------------------------------------------
  // Handlers de Ações do Usuário
  // ---------------------------------------------------------------------------

  /** Exporta os resultados como arquivo PDF com gráficos incluídos */
  const handleExportPDF = useCallback(async () => {
    setExporting(true)
    try {
      // Captura os 3 gráficos em paralelo para melhor performance
      const [rps, latency, errors] = await Promise.all([
        captureChartImage('rps-chart-result'),
        captureChartImage('latency-chart-result'),
        captureChartImage('errors-chart-result'),
      ])

      const base64 = await generatePDF(result, { rps, latency, errors })
      const filename = `stressflow-report-${format(new Date(result.startTime), 'yyyy-MM-dd-HHmmss')}.pdf`
      const filePath = await window.stressflow.pdf.save(base64, filename)
      await window.stressflow.pdf.open(filePath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar PDF')
    } finally {
      setExporting(false)
    }
  }, [result, setError])

  /** Exporta os resultados como arquivo JSON bruto */
  const handleExportJSON = useCallback(async () => {
    try {
      const filename = `stressflow-result-${format(new Date(result.startTime), 'yyyy-MM-dd-HHmmss')}.json`
      await window.stressflow.json.export(
        JSON.stringify(result, null, 2),
        filename
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao exportar JSON'
      )
    }
  }, [result, setError])

  // ---------------------------------------------------------------------------
  // Atalho de teclado: Ctrl+E para exportar PDF
  // Usa ref para sempre ter a versão mais recente do handler sem precisar
  // re-registrar o listener a cada render.
  // ---------------------------------------------------------------------------

  const handleExportPDFRef = useRef(handleExportPDF)
  handleExportPDFRef.current = handleExportPDF

  useEffect(() => {
    const handler = () => handleExportPDFRef.current()
    window.addEventListener('stressflow:export-results', handler)
    return () => window.removeEventListener('stressflow:export-results', handler)
  }, [])

  // ---------------------------------------------------------------------------
  // Dados para a tabela de distribuição de latência (percentis)
  // ---------------------------------------------------------------------------

  const latencyBreakdownItems = useMemo(
    () => [
      { label: 'Mín', value: result.latency.min, tip: METRIC_EXPLANATIONS.latencyMin },
      { label: 'P50', value: result.latency.p50, tip: METRIC_EXPLANATIONS.latencyP50 },
      { label: 'P90', value: result.latency.p90, tip: METRIC_EXPLANATIONS.latencyP90 },
      { label: 'P95', value: result.latency.p95, tip: METRIC_EXPLANATIONS.latencyP95 },
      { label: 'P99', value: result.latency.p99, tip: METRIC_EXPLANATIONS.latencyP99 },
      { label: 'Máx', value: result.latency.max, tip: METRIC_EXPLANATIONS.latencyMax },
    ],
    [result.latency]
  )

  // ---------------------------------------------------------------------------
  // Renderização
  // ---------------------------------------------------------------------------

  return (
    <div className="animate-slide-up space-y-4">
      {/* ================================================================= */}
      {/* Cabeçalho: status do teste + botões de ação                       */}
      {/* ================================================================= */}
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
            type="button"
            onClick={handleExportJSON}
            aria-label="Exportar resultados em formato JSON"
            className="flex items-center gap-2 px-3 py-2 text-sm bg-sf-surface border border-sf-border rounded-lg hover:bg-sf-surfaceHover text-sf-textSecondary transition-all"
          >
            <FileJson className="w-4 h-4" aria-hidden="true" />
            JSON
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            disabled={exporting}
            aria-label="Exportar relatório em PDF (atalho: Ctrl+E)"
            className="flex items-center gap-2 px-4 py-2 text-sm bg-sf-primary hover:bg-sf-primaryHover text-white rounded-lg transition-all disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileText className="w-4 h-4" aria-hidden="true" />
            )}
            {exporting ? 'Gerando...' : 'Exportar PDF'}
            {!exporting && (
              <kbd className="text-xs opacity-60 font-normal" aria-hidden="true">Ctrl+E</kbd>
            )}
          </button>
          <button
            type="button"
            onClick={handleNewTest}
            aria-label="Iniciar novo teste (atalho: Ctrl+N)"
            className="flex items-center gap-2 px-3 py-2 text-sm bg-sf-surface border border-sf-border rounded-lg hover:bg-sf-surfaceHover text-sf-textSecondary transition-all"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Novo Teste
            <kbd className="text-xs opacity-50 font-normal" aria-hidden="true">Ctrl+N</kbd>
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Resumo em linguagem natural                                       */}
      {/* Frase simples explicando o resultado para leigos                  */}
      {/* ================================================================= */}
      <ResultsSummary result={result} />

      {/* ================================================================= */}
      {/* Nota de Saúde do Site (0-100)                                     */}
      {/* Mostra de forma visual e intuitiva como o site se saiu no teste.  */}
      {/* Inclui barra de progresso e rótulo de qualidade com cor.          */}
      {/* ================================================================= */}
      <div className={`p-4 rounded-xl border ${health.bg} ${health.border}`}>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div
              className={`text-sm font-medium ${health.color} flex items-center gap-1`}
            >
              Saúde do Site
              <InfoTooltip text={METRIC_EXPLANATIONS.healthScore} />
            </div>

            {/* Nota principal com rótulo de qualidade em badge */}
            <div className="flex items-baseline gap-3 mt-1">
              <span className={`text-3xl font-bold ${health.color}`}>
                {health.score}
              </span>
              <span className="text-lg text-sf-textMuted font-medium">
                / 100
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${health.color} ${health.bg} border ${health.border}`}
              >
                {health.label}
              </span>
            </div>

            {/* Barra visual de progresso da nota */}
            <HealthScoreBar score={health.score} color={health.color} />

            {/* Explicação em texto simples do que a nota significa */}
            <p className="text-sm text-sf-textSecondary mt-2">
              {HEALTH_EXPLANATIONS[health.label] || ''}
            </p>

            {/* Nota pré-bloqueio (exibida quando proteção interveio no teste) */}
            {preBlockHealth && (
              <div className="mt-3 pt-3 border-t border-sf-border/30">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold ${preBlockHealth.score.color}`}
                  >
                    Pré-bloqueio (até segundo {preBlockHealth.blockSecond - 1}):{' '}
                    {preBlockHealth.score.score}/100 —{' '}
                    {preBlockHealth.score.label}
                  </span>
                </div>
                <span className="text-xs text-sf-textMuted">
                  Nota calculada apenas com dados antes da proteção bloquear as
                  requisições
                </span>
              </div>
            )}
          </div>

          {/* Ícone decorativo grande indicando o nível de saúde */}
          <div
            className={`text-5xl font-bold ${health.color} opacity-20 ml-4`}
          >
            {health.score >= 80 ? '✓' : health.score >= 40 ? '!' : '✗'}
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Relatório de Proteção (WAF, rate-limiter, anti-bot, etc.)         */}
      {/* Aparece apenas se proteções foram detectadas durante o teste       */}
      {/* ================================================================= */}
      {result.protectionReport && (
        <ProtectionReportSection report={result.protectionReport} />
      )}

      {/* ================================================================= */}
      {/* Métricas Principais — 3 cards com indicadores de qualidade        */}
      {/* Cada card mostra o valor numérico + um badge colorido indicando   */}
      {/* se o valor é bom (verde), razoável (azul/amarelo) ou ruim (verm.) */}
      {/* ================================================================= */}
      <div className="grid grid-cols-3 gap-3">
        {/* Card: Capacidade de Atendimento (Requisições por Segundo) */}
        <MetricCard
          icon={<Gauge className="w-4 h-4" />}
          label="Capacidade de Atendimento"
          subLabel="Requisições por segundo"
          tooltip={METRIC_EXPLANATIONS.rps}
          value={result.rps.toLocaleString('pt-BR')}
          subValue={`${result.totalRequests.toLocaleString('pt-BR')} total`}
          color="text-sf-primary"
        />

        {/* Card: Tempo de Resposta (Latência Média) — com badge de qualidade */}
        <MetricCard
          icon={<Clock className="w-4 h-4" />}
          label="Tempo de Resposta"
          subLabel="Latência Média"
          tooltip={METRIC_EXPLANATIONS.latencyAvg}
          value={formatMs(result.latency.avg)}
          subValue={`P95: ${formatMs(result.latency.p95)}`}
          color="text-sf-accent"
          quality={latencyQuality}
        />

        {/* Card: Taxa de Falhas — com badge de qualidade */}
        <MetricCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Falhas"
          subLabel="Taxa de Erro"
          tooltip={METRIC_EXPLANATIONS.errorRate}
          value={`${result.errorRate}%`}
          subValue={`${result.totalErrors.toLocaleString('pt-BR')} erros`}
          color={result.errorRate > 5 ? 'text-sf-danger' : 'text-sf-success'}
          quality={errorQuality}
        />
      </div>

      {/* ================================================================= */}
      {/* Distribuição de Latência (Percentis) — seção expansível           */}
      {/* Mostra o tempo de resposta em diferentes percentis.               */}
      {/* Cada valor é colorido: verde = rápido, vermelho = lento.          */}
      {/* ================================================================= */}
      <div className="bg-sf-surface border border-sf-border rounded-xl">
        <button
          type="button"
          onClick={() => setShowLatencyDetail((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <h3 className="text-sm font-medium text-sf-textSecondary flex items-center gap-1">
            Distribuição de Latência
            <InfoTooltip text="Mostra os tempos de resposta em diferentes percentis — quanto menor, melhor." />
          </h3>
          {showLatencyDetail ? (
            <ChevronUp className="w-4 h-4 text-sf-textMuted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-sf-textMuted" />
          )}
        </button>
        {showLatencyDetail && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-6 gap-4">
              {latencyBreakdownItems.map((item) => (
                <div key={item.label} className="text-center">
                  <div className="text-xs text-sf-textMuted mb-1 flex items-center justify-center gap-0.5">
                    {item.label}
                    <InfoTooltip text={item.tip} />
                  </div>
                  {/* Valor colorido conforme qualidade: verde = rápido, vermelho = lento */}
                  <div
                    className={`text-sm font-mono font-medium ${getLatencyValueColor(item.value)}`}
                  >
                    {formatMs(item.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* Códigos de Status HTTP — respostas que o servidor enviou          */}
      {/* Cada código tem uma cor indicando o tipo de resposta:             */}
      {/*   Verde = sucesso, Azul = redirecionamento,                      */}
      {/*   Amarelo = erro do cliente, Vermelho = erro do servidor          */}
      {/* ================================================================= */}
      {Object.keys(result.statusCodes).length > 0 && (
        <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-sf-textSecondary mb-3">
            Respostas do Servidor
          </h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(result.statusCodes)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([code, count]) => {
                const codeNum = Number(code)
                // Verde = sucesso, Azul = redirecionamento,
                // Amarelo = erro do cliente, Vermelho = erro do servidor
                const colorClass =
                  codeNum < 300
                    ? 'text-sf-success bg-sf-success/10'
                    : codeNum < 400
                      ? 'text-blue-400 bg-blue-400/10'
                      : codeNum < 500
                        ? 'text-sf-warning bg-sf-warning/10'
                        : 'text-sf-danger bg-sf-danger/10'
                const label = STATUS_CODE_LABELS[code] || `Código ${code}`
                const percentage =
                  result.totalRequests > 0
                    ? (
                        ((count as number) / result.totalRequests) *
                        100
                      ).toFixed(1)
                    : '0'

                return (
                  <div
                    key={code}
                    className={`px-3 py-2 rounded-lg ${colorClass}`}
                  >
                    <span className="font-mono font-medium">{code}</span>
                    <span className="ml-1 text-sm font-medium">
                      — {label}
                    </span>
                    <span className="ml-2 text-sm opacity-80">
                      {(count as number).toLocaleString('pt-BR')} ({percentage}
                      %)
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Velocidade de Transferência (Throughput)                          */}
      {/* Volume de dados que o servidor enviou por segundo                 */}
      {/* ================================================================= */}
      <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
        <h3 className="text-sm font-medium text-sf-textSecondary mb-2 flex items-center gap-1">
          Velocidade de Transferência
          <InfoTooltip text={METRIC_EXPLANATIONS.throughput} />
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

      {/* ================================================================= */}
      {/* Gráficos de Desempenho ao Longo do Tempo                         */}
      {/* Mostram como as métricas variaram segundo a segundo no teste      */}
      {/* ================================================================= */}
      {displayTimeline.length > 1 && (
        <div className="space-y-4">
          <MetricsChart
            title="Requisições por Segundo"
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

      {/* ================================================================= */}
      {/* Conclusões e Recomendações                                        */}
      {/* Dicas automáticas baseadas nos resultados do teste                */}
      {/* ================================================================= */}
      <Recommendations result={result} healthScore={health.score} />

      {/* ================================================================= */}
      {/* Configuração do Teste — seção expansível                          */}
      {/* Mostra os parâmetros usados na execução do teste                  */}
      {/* ================================================================= */}
      <div className="bg-sf-surface border border-sf-border rounded-xl">
        <button
          type="button"
          onClick={() => setShowConfigDetail((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <h3 className="text-sm font-medium text-sf-textSecondary">
            Configuração do Teste
          </h3>
          {showConfigDetail ? (
            <ChevronUp className="w-4 h-4 text-sf-textMuted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-sf-textMuted" />
          )}
        </button>
        {showConfigDetail && (
          <div className="px-4 pb-4">
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
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Subcomponentes
// =============================================================================

// -----------------------------------------------------------------------------
// HealthScoreBar — Barra visual da nota de saúde
// Preenchida proporcionalmente à nota (0-100%), com cor do nível de saúde.
// Dá uma referência visual imediata de quão boa foi a performance.
// -----------------------------------------------------------------------------

function HealthScoreBar({ score, color }: { score: number; color: string }) {
  // Mapeia a cor do texto para a cor de fundo correspondente (para a barra)
  const barColorMap: Record<string, string> = {
    'text-sf-success': 'bg-sf-success',
    'text-blue-400': 'bg-blue-400',
    'text-sf-warning': 'bg-sf-warning',
    'text-sf-danger': 'bg-sf-danger',
  }
  const barColor = barColorMap[color] || 'bg-sf-primary'

  return (
    <div className="w-full h-2 bg-sf-bg/50 rounded-full overflow-hidden mt-2">
      <div
        className={`h-full rounded-full transition-all duration-1000 ease-out ${barColor}`}
        style={{ width: `${score}%` }}
      />
    </div>
  )
}

// -----------------------------------------------------------------------------
// MetricCard — Card individual de métrica (memoizado)
// Mostra o valor numérico com rótulo, tooltip explicativo e (opcionalmente)
// um badge de qualidade colorido (ex: "Rápido" em verde, "Crítico" em vermelho).
//
// React.memo evita re-render desnecessário quando o componente pai atualiza
// estado local (ex: expandir/colapsar seções de latência ou configuração).
// -----------------------------------------------------------------------------

interface MetricCardProps {
  icon: ReactNode
  label: string
  subLabel?: string
  tooltip?: string
  value: string
  subValue: string
  color: string
  /** Badge de qualidade opcional (ex: "Rápido", "Crítico") */
  quality?: QualityInfo
}

const MetricCard = memo(function MetricCard({
  icon,
  label,
  subLabel,
  tooltip,
  value,
  subValue,
  color,
  quality,
}: MetricCardProps) {
  return (
    <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
      {/* Rótulo com ícone e tooltip */}
      <div className={`flex items-center gap-1.5 text-xs ${color} mb-1`}>
        {icon}
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>

      {/* Sub-rótulo descritivo (ex: "Latência Média") */}
      {subLabel && (
        <div className="text-[10px] text-sf-textMuted -mt-0.5 mb-1">
          {subLabel}
        </div>
      )}

      {/* Valor principal + badge de qualidade lado a lado */}
      <div className="flex items-center gap-2">
        <div className="text-2xl font-bold text-sf-text font-mono">
          {value}
        </div>
        {quality && (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${quality.color} ${quality.bgColor}`}
          >
            {quality.label}
          </span>
        )}
      </div>

      {/* Informação secundária (ex: "P95: 234ms") */}
      <div className="text-xs text-sf-textMuted mt-1">{subValue}</div>
    </div>
  )
})

// -----------------------------------------------------------------------------
// Recommendations — Conclusões e recomendações automáticas (memoizado)
// Analisa os resultados do teste e gera dicas práticas para o usuário.
// Recebe healthScore como prop para evitar recálculo duplicado.
//
// React.memo evita recalcular a lista de dicas quando o componente pai
// re-renderiza por mudança de estado local.
// -----------------------------------------------------------------------------

const Recommendations = memo(function Recommendations({
  result,
  healthScore,
}: {
  result: TestResult
  /** Nota de saúde já calculada pelo componente pai */
  healthScore: number
}) {
  // Gera lista de dicas baseadas nos resultados
  const tips: { text: string; type: 'success' | 'warning' | 'danger' }[] = []

  // Alerta: tempo de resposta alto (P95 acima de 2 segundos)
  if (result.latency.p95 > 2000) {
    tips.push({
      text: 'O tempo de resposta está alto — considere otimizar o servidor ou reduzir o tamanho das páginas.',
      type: 'warning',
    })
  }

  // Alerta: muitas requisições falharam (mais de 5%)
  if (result.errorRate > 5) {
    tips.push({
      text: 'Muitas requisições falharam — verifique se o servidor suporta a quantidade de acessos simultâneos.',
      type: 'danger',
    })
  }

  // Alerta: proteção do site bloqueou requisições durante o teste
  const report = result.protectionReport
  if (report) {
    const hasBlocking = report.behavioralPatterns.some(
      (p) => p.type === 'blocking' || p.type === 'throttling'
    )
    if (hasBlocking || report.rateLimitInfo.detected) {
      tips.push({
        text: 'O sistema de proteção do site bloqueou requisições — para testes mais precisos, considere configurar uma whitelist no servidor.',
        type: 'warning',
      })
    }
  }

  // Mensagem positiva quando tudo está excelente
  if (
    tips.length === 0 &&
    healthScore >= 80 &&
    result.errorRate < 1 &&
    result.latency.p95 < 500
  ) {
    tips.push({
      text: 'Tudo certo! O site apresentou excelente performance sob a carga testada.',
      type: 'success',
    })
  }

  // Não renderiza a seção se não há nenhuma dica
  if (tips.length === 0) return null

  // Mapa de cores para cada tipo de dica
  const colorMap = {
    success: 'text-sf-success',
    warning: 'text-sf-warning',
    danger: 'text-sf-danger',
  }

  return (
    <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
      <h3 className="text-sm font-medium text-sf-textSecondary mb-3 flex items-center gap-1.5">
        <Lightbulb className="w-4 h-4" />
        Conclusões e Recomendações
      </h3>
      <ul className="space-y-2">
        {tips.map((tip, i) => (
          <li
            key={i}
            className={`text-sm flex items-start gap-2 ${colorMap[tip.type]}`}
          >
            <span className="mt-1 shrink-0">•</span>
            <span>{tip.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
})
