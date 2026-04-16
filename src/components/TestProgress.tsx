/**
 * TestProgress.tsx
 *
 * Painel ao vivo exibido enquanto o teste de estresse está rodando.
 * Mostra barra de progresso, métricas em tempo real e gráficos de acompanhamento.
 *
 * -- Glossario rapido (para quem não e técnico) --
 *  RPS          = Requests Por Segundo — quantas requisições o servidor atende por segundo.
 *  Latência     = Tempo que o servidor demora para responder a cada requisição.
 *  P95          = Percentil 95 — 95% das requisições foram mais rapidas que esse valor.
 *  Taxa de Erro = Porcentagem de requisições que falharam.
 */

import { useCallback, useMemo, memo } from "react";
import type { ReactNode } from "react";
import {
  StopCircle,
  Activity,
  BarChart3,
  Clock,
  AlertTriangle,
  Gauge,
  Users,
  TrendingUp,
  Heart,
} from "lucide-react";
import { useTestStore } from "@/stores/test-store";
import { BenchmarkConsensusPanel } from "@/components/BenchmarkConsensusPanel";
import { MetricsChart } from "@/components/MetricsChart";
import { InfoTooltip } from "@/components/InfoTooltip";
import { METRIC_EXPLANATIONS } from "@/components/results-constants";
import { formatMs } from "@/shared/test-analysis";
import {
  buildJMeterConfigFromTestConfig,
  buildK6ConfigFromTestConfig,
  buildLocustConfigFromTestConfig,
} from "@/shared/external-benchmark-configs";
import type {
  LiveActivityData,
  LiveVuActivitySnapshot,
  LiveVuActivityState,
} from "@/types";

// ---------------------------------------------------------------------------
// Utilitarios de formatacao
// ---------------------------------------------------------------------------

/** Formata segundos restantes em "Xmin Ys" ou "Xs" */
function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "finalizando...";
  if (seconds < 60) return `${seconds}s restantes`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}min ${sec}s restantes`;
}

function formatActivityAge(timestamp: number): string {
  const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSeconds <= 1) return "agora";
  return `${diffSeconds}s atrás`;
}

function getStateBadge(state: LiveVuActivityState): {
  label: string;
  className: string;
} {
  switch (state) {
    case "requesting":
      return {
        label: "Acessando",
        className:
          "bg-sf-primary/10 text-sf-primary border border-sf-primary/30",
      };
    case "success":
      return {
        label: "OK",
        className:
          "bg-sf-success/10 text-sf-success border border-sf-success/30",
      };
    case "error":
      return {
        label: "Erro",
        className:
          "bg-sf-danger/10 text-sf-danger border border-sf-danger/30",
      };
    case "reauthenticating":
      return {
        label: "Reautenticando",
        className:
          "bg-sf-warning/10 text-sf-warning border border-sf-warning/30",
      };
    case "queued":
    default:
      return {
        label: "Na fila",
        className:
          "bg-sf-surface text-sf-textSecondary border border-sf-border",
      };
  }
}

function formatRequestStatus(activity: LiveVuActivitySnapshot): string {
  if (activity.state === "requesting") {
    return `${activity.method} em andamento`;
  }
  if (activity.statusCode !== undefined) {
    const latency =
      activity.latencyMs !== undefined ? ` • ${formatMs(activity.latencyMs)}` : "";
    return `${activity.statusCode}${latency}`;
  }
  if (activity.message) {
    return activity.message;
  }
  return activity.method;
}

// ---------------------------------------------------------------------------
// Avaliacao em tempo real — classifica a saude do servidor enquanto o teste roda
// ---------------------------------------------------------------------------

/**
 * Retorna um "semaforo" de saude baseado na taxa de erro e latência atuais.
 * Isso ajuda o usuário a entender rapidamente se o servidor está aguentando.
 */
interface LiveHealthStatus {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}

function getLiveHealthStatus(
  errorRate: number,
  latencyP95: number,
): LiveHealthStatus {
  // Servidor falhando muito — situação critica
  if (errorRate > 20 || latencyP95 > 10000) {
    return {
      label: "Critico",
      color: "text-sf-danger",
      bgColor: "bg-sf-danger/10",
      borderColor: "border-sf-danger/30",
      description: "O servidor está com dificuldades serias para responder.",
    };
  }

  // Alguns erros ou lentidao perceptivel — merece atenção
  if (errorRate > 5 || latencyP95 > 3000) {
    return {
      label: "Degradado",
      color: "text-sf-warning",
      bgColor: "bg-sf-warning/10",
      borderColor: "border-sf-warning/30",
      description: "O servidor está respondendo, mas com lentidao ou falhas.",
    };
  }

  // Tudo fluindo bem
  return {
    label: "Saudavel",
    color: "text-sf-success",
    bgColor: "bg-sf-success/10",
    borderColor: "border-sf-success/30",
    description: "O servidor está respondendo bem a carga aplicada.",
  };
}

// ---------------------------------------------------------------------------
// Componente principal — Painel de progresso do teste
// ---------------------------------------------------------------------------

export function TestProgress() {
  // Estado global: dados de progresso, histórico de métricas e configuração
  const progress = useTestStore((s) => s.progress);
  const timeline = useTestStore((s) => s.timeline);
  const config = useTestStore((s) => s.config);
  const benchmarkRunKey = useTestStore((s) => s.benchmarks.runKey);

  // Otimizacao: useCallback garante referência estável para o handler de cancelamento.
  // Sem isso, uma nova função e criada a cada re-render (a cada segundo durante o teste),
  // causando re-render desnecessario no botão de cancelar.
  const handleCancel = useCallback(async () => {
    try {
      await window.stressflow.test.cancel();
    } catch (err) {
      console.warn("[CPX-Stress] Falha ao cancelar teste:", err);
    }
  }, []);

  // Otimizacao: useMemo para cálculos derivados que dependem de progress e config.
  // Sem memoizacao, esses cálculos (incluindo getLiveHealthStatus que aloca objetos)
  // rodam em cada re-render. Agrupados em um único useMemo para evitar overhead
  // de multiplos hooks e manter o código coeso.
  const {
    currentSecond,
    totalSeconds,
    percentage,
    secondsRemaining,
    errorRate,
    liveHealth,
  } = useMemo(() => {
    const _currentSecond = progress?.currentSecond ?? 0;
    const _totalSeconds = progress?.totalSeconds ?? config.duration;
    const _percentage =
      _totalSeconds > 0
        ? Math.min(100, Math.round((_currentSecond / _totalSeconds) * 100))
        : 0;
    const _secondsRemaining = _totalSeconds - _currentSecond;

    const _errorRate =
      progress && progress.cumulative.totalRequests > 0
        ? (progress.cumulative.totalErrors /
            progress.cumulative.totalRequests) *
          100
        : 0;

    const _liveHealth = progress
      ? getLiveHealthStatus(_errorRate, progress.metrics.latencyP95)
      : null;

    return {
      currentSecond: _currentSecond,
      totalSeconds: _totalSeconds,
      percentage: _percentage,
      secondsRemaining: _secondsRemaining,
      errorRate: _errorRate,
      liveHealth: _liveHealth,
    };
  }, [progress, config.duration]);

  const k6Config = useMemo(() => buildK6ConfigFromTestConfig(config), [config]);
  const locustConfig = useMemo(
    () => buildLocustConfigFromTestConfig(config),
    [config],
  );
  const jmeterConfig = useMemo(
    () => buildJMeterConfigFromTestConfig(config),
    [config],
  );
  // ---------------------------------------------------------------------------
  // Renderização
  // ---------------------------------------------------------------------------
  return (
    <div
      className="animate-slide-up"
      role="region"
      aria-label="Painel de progresso do teste em execução"
    >
      {/* ===== Cabeçalho: título + URL + botão de cancelar ===== */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-sf-text flex items-center gap-2">
            <Activity
              className="w-5 h-5 text-sf-accent animate-pulse-glow"
              aria-hidden="true"
            />
            Teste em Execução
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
          aria-label="Cancelar teste em execução (atalho: Escape)"
          className="flex items-center gap-2 px-4 py-2 bg-sf-danger/10 text-sf-danger border border-sf-danger/30 rounded-lg hover:bg-sf-danger/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-danger focus-visible:ring-offset-1"
        >
          <StopCircle className="w-4 h-4" aria-hidden="true" />
          Cancelar
        </button>
      </div>

      {/* ===== Barra de progresso com tempo restante ===== */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-sf-textSecondary flex items-center gap-1.5">
            <Clock className="w-4 h-4" aria-hidden="true" />
            Progresso
            <InfoTooltip text="Indica quanto do tempo total do teste já foi executado. O teste dispara requisições continuamente até o tempo acabar." />
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
        <progress
          value={percentage}
          max={100}
          className="test-progress-bar w-full"
          aria-label={`Progresso do teste: ${percentage}% concluido, ${formatTimeRemaining(secondsRemaining)}`}
        />
        {/* Marcadores de 25%, 50%, 75% para referência visual */}
        <div className="flex justify-between mt-1 px-0.5">
          {[0, 25, 50, 75, 100].map((mark) => (
            <span
              key={mark}
              className={`text-[10px] ${
                percentage >= mark
                  ? "text-sf-textSecondary"
                  : "text-sf-textMuted/40"
              }`}
            >
              {mark}%
            </span>
          ))}
        </div>
      </div>

      {/* ===== Indicador de saude em tempo real ===== */}
      {/* Mostra ao usuário se o servidor está aguentando a carga ou se já está degradando */}
      {liveHealth && (
        <div
          className={`flex items-center gap-3 mb-6 p-3 rounded-xl border ${liveHealth.bgColor} ${liveHealth.borderColor}`}
          role="status"
          aria-live="polite"
          aria-label={`Saude do servidor: ${liveHealth.label}. ${liveHealth.description}`}
        >
          <Heart
            className={`w-4 h-4 ${liveHealth.color} shrink-0`}
            aria-hidden="true"
          />
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

      {/* ===== Métricas ao vivo — cartoes com valores atualizados a cada segundo ===== */}
      {progress && (
        <div
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"
          role="region"
          aria-label="Métricas do teste em tempo real"
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
            sublabel="Latência P95"
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
            color={
              errorRate > 5
                ? "text-sf-danger"
                : errorRate > 1
                  ? "text-sf-warning"
                  : "text-sf-success"
            }
          />

          {/* Total de requisições enviadas até agora */}
          <LiveMetricCard
            icon={<Users className="w-4 h-4" />}
            label="Requisições"
            sublabel="Total enviado"
            tooltip="Quantidade total de requisições que já foram enviadas ao servidor desde o início do teste."
            value={progress.cumulative.totalRequests.toLocaleString("pt-BR")}
            color="text-sf-text"
          />
        </div>
      )}

      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-sf-textSecondary">
          <BarChart3 className="w-4 h-4 text-sf-primary" />
          Benchmarks Externos
        </div>
        <BenchmarkConsensusPanel
          runKey={benchmarkRunKey}
          allowRuns={false}
          executionMode="sequential"
          k6Config={k6Config}
          locustConfig={locustConfig}
          jmeterConfig={jmeterConfig}
          cpxResult={{
            avgLatency: progress?.metrics.latencyAvg ?? 0,
            p90Latency: progress?.metrics.latencyP90 ?? 0,
            p95Latency: progress?.metrics.latencyP95 ?? 0,
            p99Latency: progress?.metrics.latencyP99 ?? 0,
            rps: progress?.cumulative.rps ?? 0,
            errorRate,
            totalRequests: progress?.cumulative.totalRequests ?? 0,
          }}
        />
      </div>

      {progress && (
        <LiveVuActivityPanel liveActivity={progress.liveActivity} />
      )}

      {/* ===== Gráficos em tempo real ===== */}
      {/* Os gráficos so aparecem após pelo menos 2 segundos de dados (para ter pontos suficientes) */}
      {timeline.length > 1 && (
        <div
          className="space-y-4"
          role="region"
          aria-label="Gráficos de métricas em tempo real"
        >
          {/* Quantas requisições o servidor processou a cada segundo */}
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
            title="Latência (ms)"
            data={timeline}
            lines={[
              { key: "latencyP50", color: "#22c55e", label: "P50 (tipico)" },
              { key: "latencyP95", color: "#f59e0b", label: "P95 (lento)" },
              {
                key: "latencyP99",
                color: "#ef4444",
                label: "P99 (muito lento)",
              },
            ]}
            id="latency-chart"
            animated={false}
          />

          {/* Quantidade de erros a cada segundo — idealmente esse gráfico fica em zero */}
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
  );
}

// ---------------------------------------------------------------------------
// Subcomponente — Cartao de métrica ao vivo
// ---------------------------------------------------------------------------

/**
 * Exibe uma métrica individual com icone, label explicativo, tooltip e valor.
 * Usado nos 4 cartoes de métricas na parte superior do painel.
 */
interface LiveMetricCardProps {
  icon: ReactNode;
  label: string;
  sublabel: string;
  tooltip: string;
  value: string;
  color: string;
}

// Otimizacao: React.memo impede que LiveMetricCard re-renderize quando suas
// props não mudaram. Durante o teste ao vivo, o componente pai re-renderiza
// a cada segundo, mas nem sempre todas as 4 métricas mudam simultaneamente.
// Sem memo, os 4 cartoes seriam recriados a cada tick, incluindo os icones
// e InfoTooltip internos (que são estaticos).
const LiveMetricCard = memo(function LiveMetricCard({
  icon,
  label,
  sublabel,
  tooltip,
  value,
  color,
}: LiveMetricCardProps) {
  return (
    <div
      className="bg-sf-surface border border-sf-border rounded-xl p-4 transition-colors"
      role="group"
      aria-label={`${label}: ${value}`}
    >
      {/* Cabeçalho: icone + nome da métrica + tooltip de ajuda */}
      <div className={`flex items-center gap-1.5 text-xs ${color} mb-0.5`}>
        <span aria-hidden="true">{icon}</span>
        {label}
        <InfoTooltip text={tooltip} />
      </div>
      {/* Sub-rótulo técnico em texto menor */}
      <div className="text-[10px] text-sf-textMuted mb-1">{sublabel}</div>
      {/* Valor principal em destaque */}
      <div className="text-xl font-bold text-sf-text font-mono">{value}</div>
    </div>
  );
});

interface LiveVuActivityPanelProps {
  liveActivity: LiveActivityData;
}

const LiveVuActivityPanel = memo(function LiveVuActivityPanel({
  liveActivity,
}: LiveVuActivityPanelProps) {
  return (
    <div
      className="bg-sf-surface border border-sf-border rounded-xl p-4 mb-6"
      role="region"
      aria-label="Atividade ao vivo dos VUs"
    >
      <div className="flex flex-col gap-2 mb-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-medium text-sf-text flex items-center gap-1.5">
            Atividade dos VUs
            <InfoTooltip text="Mostra o que cada usuário virtual está acessando agora. Em cargas muito altas, a interface troca automaticamente para um resumo agregado por operação." />
          </h3>
          <p className="text-xs text-sf-textMuted mt-1">
            {liveActivity.totalVus.toLocaleString("pt-BR")} VUs monitorados ao vivo.
          </p>
        </div>
        {liveActivity.mode === "summary" && (
          <div className="text-xs text-sf-warning bg-sf-warning/10 border border-sf-warning/30 rounded-lg px-3 py-2">
            Exibindo resumo agregado porque o teste passou de{" "}
            {liveActivity.fallbackThreshold.toLocaleString("pt-BR")} VUs.
          </div>
        )}
      </div>

      {liveActivity.mode === "per-vu" ? (
        <div className="max-h-[26rem] overflow-auto rounded-lg border border-sf-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 bg-sf-bg/95 backdrop-blur">
              <tr className="text-xs text-sf-textMuted border-b border-sf-border">
                <th className="text-left py-2 px-3 font-medium">VU</th>
                <th className="text-left py-2 px-3 font-medium">Status</th>
                <th className="text-left py-2 px-3 font-medium">Operação</th>
                <th className="text-left py-2 px-3 font-medium">Alvo</th>
                <th className="text-left py-2 px-3 font-medium">
                  HTTP/Latência
                </th>
                <th className="text-left py-2 px-3 font-medium">Atualização</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sf-border/50">
              {liveActivity.vus.map((activity) => {
                const badge = getStateBadge(activity.state);
                return (
                  <tr
                    key={activity.vuId}
                    className="hover:bg-sf-bg/30 transition-colors"
                  >
                    <td className="py-2 px-3 font-mono text-sf-text">
                      #{activity.vuId}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sf-text font-medium">
                      {activity.operationName}
                    </td>
                    <td
                      className="py-2 px-3 text-sf-textSecondary font-mono text-xs"
                      title={activity.targetLabel}
                    >
                      {activity.targetLabel}
                    </td>
                    <td className="py-2 px-3 text-sf-textSecondary font-mono text-xs">
                      {formatRequestStatus(activity)}
                    </td>
                    <td className="py-2 px-3 text-sf-textMuted text-xs">
                      {formatActivityAge(activity.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-sf-border">
          <table className="w-full min-w-[540px] text-sm">
            <thead className="bg-sf-bg/95">
              <tr className="text-xs text-sf-textMuted border-b border-sf-border">
                <th className="text-left py-2 px-3 font-medium">Operação</th>
                <th className="text-right py-2 px-3 font-medium">VUs ativos</th>
                <th className="text-right py-2 px-3 font-medium">
                  Req./seg atual
                </th>
                <th className="text-right py-2 px-3 font-medium">
                  Erros/seg atual
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sf-border/50">
              {liveActivity.summary.map((operation) => (
                <tr
                  key={operation.operationName}
                  className="hover:bg-sf-bg/30 transition-colors"
                >
                  <td className="py-2 px-3 text-sf-text font-medium">
                    {operation.operationName}
                  </td>
                  <td className="py-2 px-3 text-right text-sf-textSecondary font-mono">
                    {operation.activeVus.toLocaleString("pt-BR")}
                  </td>
                  <td className="py-2 px-3 text-right text-sf-textSecondary font-mono">
                    {operation.lastSecondRequests.toLocaleString("pt-BR")}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">
                    <span
                      className={
                        operation.lastSecondErrors > 0
                          ? "text-sf-danger"
                          : "text-sf-success"
                      }
                    >
                      {operation.lastSecondErrors.toLocaleString("pt-BR")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
