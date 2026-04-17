import { useCallback, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  Scale,
} from "lucide-react";
import { useTestStore } from "@/stores/test-store";
import { formatMs } from "@/shared/test-analysis";
import type {
  ExternalBenchmarkEngine,
  ExternalBenchmarksState,
  JMeterConfig,
  JMeterSummary,
  K6Config,
  K6Summary,
  LocustConfig,
  LocustSummary,
  PersistedExternalBenchmarks,
} from "@/types";

interface ComparisonInput {
  avgLatency: number;
  p90Latency: number;
  p95Latency: number;
  p99Latency: number;
  rps: number;
  errorRate: number;
  totalRequests?: number;
}

interface BenchmarkConsensusPanelProps {
  resultId?: string | null;
  cpxResult: ComparisonInput;
  k6Config: K6Config;
  locustConfig: LocustConfig;
  jmeterConfig: JMeterConfig;
  runKey?: string | null;
  autoStartOnMount?: boolean;
  allowRuns?: boolean;
  executionMode?: "parallel" | "sequential";
}

type EngineName = "cpx" | "k6" | "locust" | "jmeter";
type Tone = "aligned" | "warning" | "divergent" | "neutral";
type MetricKind = "relative" | "absolute";

interface MetricDefinition {
  key:
    | "avgLatency"
    | "p95Latency"
    | "p99Latency"
    | "rps"
    | "errorRatePercent"
    | "totalRequests";
  label: string;
  unit: string;
  kind: MetricKind;
  alignedThreshold: number;
  warningThreshold: number;
}

interface EngineCell {
  value: number | null;
  tone: Tone;
}

interface ConsensusRow {
  metric: MetricDefinition;
  consensusValue: number | null;
  consensusTone: Tone;
  spread: number | null;
  comparableCount: number;
  cells: Record<EngineName, EngineCell>;
}

const METRICS: MetricDefinition[] = [
  {
    key: "avgLatency",
    label: "Avg latência",
    unit: "ms",
    kind: "relative",
    alignedThreshold: 10,
    warningThreshold: 20,
  },
  {
    key: "p95Latency",
    label: "P95",
    unit: "ms",
    kind: "relative",
    alignedThreshold: 15,
    warningThreshold: 25,
  },
  {
    key: "p99Latency",
    label: "P99",
    unit: "ms",
    kind: "relative",
    alignedThreshold: 15,
    warningThreshold: 25,
  },
  {
    key: "rps",
    label: "RPS",
    unit: "req/s",
    kind: "relative",
    alignedThreshold: 5,
    warningThreshold: 10,
  },
  {
    key: "errorRatePercent",
    label: "Error rate",
    unit: "%",
    kind: "absolute",
    alignedThreshold: 2,
    warningThreshold: 5,
  },
  {
    key: "totalRequests",
    label: "Requests totais",
    unit: "req",
    kind: "relative",
    alignedThreshold: 10,
    warningThreshold: 20,
  },
];

const CONSENSUS_ENGINES: EngineName[] = ["cpx", "k6", "locust", "jmeter"];
const MIN_CONSENSUS_VALUES = 3;

function formatValue(value: number | null, unit: string): string {
  if (value === null) return "—";
  if (unit === "ms") return formatMs(value);
  if (unit === "%") {
    return `${value.toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}%`;
  }
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: unit === "req/s" ? 2 : 0,
  })}${unit === "req" ? "" : ` ${unit}`}`.trim();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function classifyMetric(
  value: number | null,
  consensus: number | null,
  metric: MetricDefinition,
): Tone {
  if (value === null || consensus === null) return "neutral";
  if (metric.kind === "absolute") {
    const delta = Math.abs(value - consensus);
    if (delta <= metric.alignedThreshold) return "aligned";
    if (delta <= metric.warningThreshold) return "warning";
    return "divergent";
  }

  if (consensus === 0 && value === 0) return "aligned";
  if (consensus === 0 || value === 0) return "divergent";

  const relative = (Math.abs(value - consensus) / consensus) * 100;
  if (relative <= metric.alignedThreshold) return "aligned";
  if (relative <= metric.warningThreshold) return "warning";
  return "divergent";
}

function toneClass(tone: Tone): string {
  if (tone === "aligned") return "text-sf-success";
  if (tone === "warning") return "text-sf-warning";
  if (tone === "divergent") return "text-sf-danger";
  return "text-sf-textMuted";
}

function toneLabel(tone: Tone): string {
  if (tone === "aligned") return "Convergente";
  if (tone === "warning") return "Oscilando";
  if (tone === "divergent") return "Divergente";
  return "Aguardando amostra";
}

function buildSpread(values: number[], metric: MetricDefinition): number {
  if (values.length <= 1) return 0;
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (metric.kind === "absolute") return max - min;
  const mid = median(values);
  if (mid === 0) return max - min;
  return ((max - min) / mid) * 100;
}

function normalizeExternalMetrics(
  summary: K6Summary | LocustSummary | JMeterSummary | null,
): Record<MetricDefinition["key"], number | null> {
  if (!summary) {
    return {
      avgLatency: null,
      p95Latency: null,
      p99Latency: null,
      rps: null,
      errorRatePercent: null,
      totalRequests: null,
    };
  }

  return {
    avgLatency: summary.avgLatency,
    p95Latency: summary.p95Latency,
    p99Latency: summary.p99Latency,
    rps: summary.rps,
    errorRatePercent: summary.errorRate * 100,
    totalRequests: summary.totalReqs,
  };
}

function latestLines(lines: string[]): string {
  return lines.slice(-10).join("");
}

function createPersistedBenchmarksSnapshot(
  benchmarks: ExternalBenchmarksState,
): PersistedExternalBenchmarks {
  return {
    started: benchmarks.started,
    k6: {
      available: benchmarks.k6.available,
      status: benchmarks.k6.status,
      error: benchmarks.k6.error,
      progress: [...benchmarks.k6.progress],
      summary: benchmarks.k6.summary,
    },
    locust: {
      available: benchmarks.locust.available,
      status: benchmarks.locust.status,
      error: benchmarks.locust.error,
      progress: [...benchmarks.locust.progress],
      summary: benchmarks.locust.summary,
    },
    jmeter: {
      available: benchmarks.jmeter.available,
      status: benchmarks.jmeter.status,
      error: benchmarks.jmeter.error,
      progress: [...benchmarks.jmeter.progress],
      summary: benchmarks.jmeter.summary,
    },
  };
}

export function BenchmarkConsensusPanel({
  resultId = null,
  cpxResult,
  k6Config,
  locustConfig,
  jmeterConfig,
  runKey = null,
  autoStartOnMount = false,
  allowRuns = true,
  executionMode = "parallel",
}: BenchmarkConsensusPanelProps) {
  const benchmarks = useTestStore((s) => s.benchmarks);
  const setBenchmarkRun = useTestStore((s) => s.setBenchmarkRun);
  const markBenchmarksStarted = useTestStore((s) => s.markBenchmarksStarted);
  const setBenchmarkAvailable = useTestStore((s) => s.setBenchmarkAvailable);
  const setBenchmarkStatus = useTestStore((s) => s.setBenchmarkStatus);
  const appendBenchmarkProgress = useTestStore((s) => s.appendBenchmarkProgress);
  const setBenchmarkError = useTestStore((s) => s.setBenchmarkError);
  const setBenchmarkSummary = useTestStore((s) => s.setBenchmarkSummary);
  const resetBenchmarkEngine = useTestStore((s) => s.resetBenchmarkEngine);
  const updateStoredResultBenchmarks = useTestStore(
    (s) => s.updateStoredResultBenchmarks,
  );
  const isRunContextCurrent = useCallback((expectedRunKey: string | null) => {
    if (!expectedRunKey) return true;
    return useTestStore.getState().benchmarks.runKey === expectedRunKey;
  }, []);

  const commitForRunContext = useCallback(
    (expectedRunKey: string | null, apply: () => void): boolean => {
      if (!isRunContextCurrent(expectedRunKey)) return false;
      apply();
      return true;
    },
    [isRunContextCurrent],
  );

  const persistBenchmarksSnapshot = useCallback(
    (expectedRunKey: string | null) => {
      if (!resultId || !isRunContextCurrent(expectedRunKey)) return;

      const snapshot = createPersistedBenchmarksSnapshot(
        useTestStore.getState().benchmarks,
      );

      updateStoredResultBenchmarks(resultId, snapshot);
      void window.stressflow.history
        .saveBenchmarks(resultId, snapshot)
        .catch((error) => {
          console.warn(
            "[CPX-Stress] Falha ao persistir benchmarks externos no histórico:",
            error,
          );
        });
    },
    [isRunContextCurrent, resultId, updateStoredResultBenchmarks],
  );

  const runEngine = useCallback(
    async (
      engine: ExternalBenchmarkEngine,
      expectedRunKey: string | null = runKey,
    ) => {
      if (!allowRuns) return;
      if (
        !commitForRunContext(expectedRunKey, () => {
          resetBenchmarkEngine(engine);
          setBenchmarkStatus(engine, "checking");
          setBenchmarkError(engine, null);
        })
      ) {
        return;
      }

      let available = false;
      try {
        if (engine === "k6") available = await window.stressflow.k6Check();
        if (engine === "locust") available = await window.stressflow.locustCheck();
        if (engine === "jmeter") {
          available = await window.stressflow.jmeterCheck();
        }
      } catch {
        available = false;
      }

      if (
        !commitForRunContext(expectedRunKey, () => {
          setBenchmarkAvailable(engine, available);
        })
      ) {
        return;
      }
      if (!available) {
        commitForRunContext(expectedRunKey, () => {
          setBenchmarkStatus(engine, "error");
          setBenchmarkError(
            engine,
            `Engine ${engine} não disponível no ambiente atual.`,
          );
        });
        persistBenchmarksSnapshot(expectedRunKey);
        return;
      }

      const subscribe =
        engine === "k6"
          ? window.stressflow.onK6Progress
          : engine === "locust"
            ? window.stressflow.onLocustProgress
            : window.stressflow.onJMeterProgress;

      const unsubscribe = subscribe((line) => {
        commitForRunContext(expectedRunKey, () => {
          appendBenchmarkProgress(engine, line);
        });
      });

      try {
        if (
          !commitForRunContext(expectedRunKey, () => {
            setBenchmarkStatus(engine, "running");
          })
        ) {
          return;
        }

        if (engine === "k6") {
          const summary = await window.stressflow.k6Run(k6Config);
          commitForRunContext(expectedRunKey, () => {
            setBenchmarkSummary("k6", summary);
            setBenchmarkStatus(engine, "done");
          });
        } else if (engine === "locust") {
          const summary = await window.stressflow.locustRun(locustConfig);
          commitForRunContext(expectedRunKey, () => {
            setBenchmarkSummary("locust", summary);
            setBenchmarkStatus(engine, "done");
          });
        } else if (engine === "jmeter") {
          const summary = await window.stressflow.jmeterRun(jmeterConfig);
          commitForRunContext(expectedRunKey, () => {
            setBenchmarkSummary("jmeter", summary);
            setBenchmarkStatus(engine, "done");
          });
        }
        persistBenchmarksSnapshot(expectedRunKey);
      } catch (cause) {
        commitForRunContext(expectedRunKey, () => {
          setBenchmarkStatus(engine, "error");
          setBenchmarkError(
            engine,
            cause instanceof Error
              ? cause.message
              : `Falha ao executar ${engine}.`,
          );
        });
        persistBenchmarksSnapshot(expectedRunKey);
      } finally {
        unsubscribe();
      }
    },
    [
      allowRuns,
      appendBenchmarkProgress,
      commitForRunContext,
      jmeterConfig,
      k6Config,
      locustConfig,
      persistBenchmarksSnapshot,
      resetBenchmarkEngine,
      runKey,
      setBenchmarkAvailable,
      setBenchmarkError,
      setBenchmarkStatus,
      setBenchmarkSummary,
    ],
  );

  const runAll = useCallback(async () => {
    if (!allowRuns) return;

    if (runKey && !isRunContextCurrent(runKey)) {
      setBenchmarkRun(runKey);
    }
    const expectedRunKey = runKey ?? useTestStore.getState().benchmarks.runKey;

    const engines: ExternalBenchmarkEngine[] = [
      "k6",
      "locust",
      "jmeter",
    ];

    if (executionMode === "sequential") {
      for (const engine of engines) {
        if (!isRunContextCurrent(expectedRunKey)) {
          break;
        }
        await runEngine(engine, expectedRunKey);
      }
      return;
    }

    await Promise.allSettled(
      engines.map((engine) => runEngine(engine, expectedRunKey)),
    );
  }, [
    allowRuns,
    executionMode,
    isRunContextCurrent,
    runEngine,
    runKey,
    setBenchmarkRun,
  ]);

  useEffect(() => {
    if (!allowRuns || !runKey || !autoStartOnMount) return;
    if (benchmarks.runKey !== runKey) return;
    if (benchmarks.started) return;

    markBenchmarksStarted();
    void runAll();
  }, [
    autoStartOnMount,
    benchmarks.runKey,
    benchmarks.started,
    markBenchmarksStarted,
    runAll,
    runKey,
  ]);

  const rows = useMemo<ConsensusRow[]>(() => {
    const k6Metrics = normalizeExternalMetrics(benchmarks.k6.summary);
    const locustMetrics = normalizeExternalMetrics(benchmarks.locust.summary);
    const jmeterMetrics = normalizeExternalMetrics(benchmarks.jmeter.summary);

    return METRICS.map((metric) => {
      const cpxValue =
        metric.key === "totalRequests"
          ? (cpxResult.totalRequests ?? null)
          : cpxResult[metric.key as keyof ComparisonInput] ?? null;

      const valuesByEngine: Record<EngineName, number | null> = {
        cpx: cpxValue,
        k6: k6Metrics[metric.key],
        locust: locustMetrics[metric.key],
        jmeter: jmeterMetrics[metric.key],
      };

      const consensusValues = CONSENSUS_ENGINES.map(
        (engine) => valuesByEngine[engine],
      ).filter((value): value is number => typeof value === "number");

      const consensusValue =
        consensusValues.length >= MIN_CONSENSUS_VALUES
          ? median(consensusValues)
          : null;
      const spread =
        consensusValue !== null ? buildSpread(consensusValues, metric) : null;
      const consensusTone =
        spread === null
          ? "neutral"
          : metric.kind === "absolute"
            ? spread <= metric.alignedThreshold
              ? "aligned"
              : spread <= metric.warningThreshold
                ? "warning"
                : "divergent"
            : spread <= metric.alignedThreshold
              ? "aligned"
              : spread <= metric.warningThreshold
                ? "warning"
                : "divergent";

      return {
        metric,
        consensusValue,
        consensusTone,
        spread,
        comparableCount: consensusValues.length,
        cells: {
          cpx: {
            value: cpxValue,
            tone: classifyMetric(cpxValue, consensusValue, metric),
          },
          k6: {
            value: k6Metrics[metric.key],
            tone: classifyMetric(k6Metrics[metric.key], consensusValue, metric),
          },
          locust: {
            value: locustMetrics[metric.key],
            tone: classifyMetric(
              locustMetrics[metric.key],
              consensusValue,
              metric,
            ),
          },
          jmeter: {
            value: jmeterMetrics[metric.key],
            tone: classifyMetric(
              jmeterMetrics[metric.key],
              consensusValue,
              metric,
            ),
          },
        },
      };
    });
  }, [benchmarks, cpxResult]);

  const consensusMeta = useMemo(() => {
    const analyzedRows = rows.filter((row) => row.consensusTone !== "neutral");
    const aligned = analyzedRows.filter((row) => row.consensusTone === "aligned").length;
    const warning = analyzedRows.filter((row) => row.consensusTone === "warning").length;
    const divergent = analyzedRows.filter((row) => row.consensusTone === "divergent").length;

    if (analyzedRows.length === 0) {
      return {
        label: "Aguardando amostra",
        className:
          "bg-sf-shellBg text-sf-textSecondary border border-sf-shellBorder",
      };
    }

    if (divergent === 0 && warning <= 1) {
      return {
        label: "Convergência forte",
        className:
          "bg-sf-success/10 text-sf-success border border-sf-success/30",
      };
    }
    if (divergent <= 2) {
      return {
        label: "Convergência parcial",
        className:
          "bg-sf-warning/10 text-sf-warning border border-sf-warning/30",
      };
    }
    return {
      label: "Convergência fraca",
      className: "bg-sf-danger/10 text-sf-danger border border-sf-danger/30",
    };
  }, [rows]);
  const analyzedMetricCount = useMemo(
    () => rows.filter((row) => row.consensusTone !== "neutral").length,
    [rows],
  );

  const availableCount = useMemo(
    () =>
      [
        benchmarks.k6.available,
        benchmarks.locust.available,
        benchmarks.jmeter.available,
      ].filter(Boolean).length,
    [benchmarks],
  );

  const runningAny = useMemo(
    () =>
      [benchmarks.k6, benchmarks.locust, benchmarks.jmeter].some(
        (entry) => entry.status === "running" || entry.status === "checking",
      ),
    [benchmarks],
  );
  const waitingForMainTest = !allowRuns && Boolean(runKey);
  const runModeText =
    executionMode === "sequential" ? "em sequência" : "em paralelo";
  const flowSelectionMode = k6Config.flowSelectionMode ?? "random";
  const flowSelectionLabel =
    flowSelectionMode === "deterministic"
      ? "Determinístico"
      : "Aleatório";
  const requestTimeoutMs =
    k6Config.requestTimeoutMs ??
    locustConfig.requestTimeoutMs ??
    jmeterConfig.requestTimeoutMs ??
    null;

  return (
    <div className="bg-sf-surface border border-sf-border rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-sf-text flex items-center gap-2">
            <Scale className="w-4 h-4 text-sf-primary" />
            Consenso Entre Engines
          </h3>
          <p className="text-xs text-sf-textMuted max-w-3xl">
            Compara o `CPX-Stress` com `k6`, `Locust` e `JMeter`,
            destacando convergência e divergência entre as medições.
          </p>
          <p className="text-[11px] text-sf-textMuted">
            Nesta tela, os benchmarks externos rodam {runModeText}.
          </p>
          {waitingForMainTest && (
            <p className="text-[11px] text-sf-textMuted">
              Aguardando a conclusão do CPX-Stress para iniciar a sequência
              oficial sem concorrência no mesmo alvo.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void runAll()}
          disabled={runningAny || !allowRuns}
          className="text-xs px-3 py-2 rounded-lg bg-sf-primary hover:bg-sf-primaryHover text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {runningAny ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          {!allowRuns
            ? "Aguardando CPX-Stress..."
            : runningAny
              ? "Executando engines..."
              : executionMode === "sequential"
                ? "Rodar todas em sequência"
                : "Rodar todas em paralelo"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`px-2.5 py-0.5 rounded-full font-semibold ${consensusMeta.className}`}
        >
          {consensusMeta.label}
        </span>
        <span className="px-2.5 py-0.5 rounded-full bg-sf-shellBg border border-sf-shellBorder text-sf-textSecondary">
          Engines externas disponíveis: {availableCount}/3
        </span>
        <span className="px-2.5 py-0.5 rounded-full bg-sf-shellBg border border-sf-shellBorder text-sf-textSecondary">
          Métricas com consenso: {analyzedMetricCount}/{rows.length}
        </span>
        <span className="px-2.5 py-0.5 rounded-full bg-sf-shellBg border border-sf-shellBorder text-sf-textSecondary">
          Fluxo: {flowSelectionLabel}
        </span>
        <span className="px-2.5 py-0.5 rounded-full bg-sf-shellBg border border-sf-shellBorder text-sf-textSecondary">
          Timeout: {requestTimeoutMs === null ? "padrão da engine" : formatMs(requestTimeoutMs)}
        </span>
      </div>

      {flowSelectionMode !== "deterministic" && (
        <p className="text-[11px] text-sf-warning">
          Para auditorias de convergência, prefira fluxo determinístico com
          timeout explícito. Isso reduz variação entre CPX, k6, Locust e
          JMeter.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <EngineControlCard
          title="k6"
          entry={benchmarks.k6}
          canRun={allowRuns}
          onRun={() => runEngine("k6")}
        />
        <EngineControlCard
          title="Locust"
          entry={benchmarks.locust}
          canRun={allowRuns}
          onRun={() => runEngine("locust")}
        />
        <EngineControlCard
          title="JMeter"
          entry={benchmarks.jmeter}
          canRun={allowRuns}
          onRun={() => runEngine("jmeter")}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-sf-textSecondary">
          <thead>
            <tr className="text-sf-textMuted border-b border-sf-border">
              <th className="text-left py-1.5 pr-3">Métrica</th>
              <th className="text-right py-1.5 px-2">CPX</th>
              <th className="text-right py-1.5 px-2">k6</th>
              <th className="text-right py-1.5 px-2">Locust</th>
              <th className="text-right py-1.5 px-2">JMeter</th>
              <th className="text-right py-1.5 px-2">Consenso</th>
              <th className="text-right py-1.5 pl-3">Leitura</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.metric.key} className="border-b border-sf-border/50">
                <td className="py-2 pr-3 text-sf-text font-medium">
                  {row.metric.label}
                </td>
                <BenchmarkCell row={row} engine="cpx" />
                <BenchmarkCell row={row} engine="k6" />
                <BenchmarkCell row={row} engine="locust" />
                <BenchmarkCell row={row} engine="jmeter" />
                <td
                  className={`py-2 px-2 text-right font-mono ${toneClass(
                    row.consensusTone,
                  )}`}
                >
                  {formatValue(row.consensusValue, row.metric.unit)}
                </td>
                <td className={`py-2 pl-3 text-right ${toneClass(row.consensusTone)}`}>
                  <span className="inline-flex items-center gap-1 font-semibold">
                    {row.consensusTone === "aligned" ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
                    {toneLabel(row.consensusTone)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ProgressCard
          title="k6"
          progress={benchmarks.k6.progress}
          artifactsDir={benchmarks.k6.summary?.artifactsDir}
          accentClass="text-sf-primary"
        />
        <ProgressCard
          title="Locust"
          progress={benchmarks.locust.progress}
          artifactsDir={benchmarks.locust.summary?.artifactsDir}
          accentClass="text-sf-accent"
        />
        <ProgressCard
          title="JMeter"
          progress={benchmarks.jmeter.progress}
          artifactsDir={benchmarks.jmeter.summary?.artifactsDir}
          accentClass="text-sky-400"
        />
      </div>
    </div>
  );
}

function EngineControlCard({
  title,
  entry,
  canRun = true,
  onRun,
}: {
  title: string;
  entry: {
    available: boolean | null;
    status: string;
    error: string | null;
    summary: { version?: string } | null;
  };
  canRun?: boolean;
  onRun: () => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-sf-border bg-sf-shellBg/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-sf-text">{title}</span>
        <button
          type="button"
          onClick={() => void onRun()}
          disabled={
            !canRun ||
            entry.available === false ||
            entry.status === "running" ||
            entry.status === "checking"
          }
          className="text-[11px] px-2.5 py-1 rounded-md bg-sf-surface hover:bg-sf-surfaceHover border border-sf-border text-sf-textSecondary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {!canRun
            ? "Aguardando..."
            : entry.status === "running" || entry.status === "checking"
            ? "Rodando..."
            : "Executar"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className={`px-2 py-0.5 rounded-full border ${
            entry.available === false
              ? "border-sf-warning/30 bg-sf-warning/10 text-sf-warning"
              : entry.available === true
                ? "border-sf-success/30 bg-sf-success/10 text-sf-success"
                : "border-sf-border bg-sf-surface text-sf-textMuted"
          }`}
        >
          {entry.available === false
            ? "Indisponível"
            : entry.available === true
              ? "Disponível"
              : "Checando"}
        </span>
        <span className="px-2 py-0.5 rounded-full border border-sf-border bg-sf-surface text-sf-textMuted">
          {entry.status}
        </span>
      </div>
      {entry.summary?.version && (
        <div className="text-[11px] text-sf-textMuted line-clamp-2">
          {entry.summary.version}
        </div>
      )}
      {entry.error && <div className="text-[11px] text-sf-danger">{entry.error}</div>}
    </div>
  );
}

function BenchmarkCell({
  row,
  engine,
}: {
  row: ConsensusRow;
  engine: EngineName;
}) {
  const cell = row.cells[engine];
  return (
    <td className={`py-2 px-2 text-right font-mono ${toneClass(cell.tone)}`}>
      {formatValue(cell.value, row.metric.unit)}
    </td>
  );
}

function ProgressCard({
  title,
  progress,
  artifactsDir,
  accentClass,
}: {
  title: string;
  progress: string[];
  artifactsDir?: string;
  accentClass: string;
}) {
  return (
    <div className="rounded-xl border border-sf-border bg-sf-shellBg/40 p-3 space-y-2">
      <div className={`text-sm font-medium ${accentClass}`}>{title}</div>
      {artifactsDir && (
        <div className="text-[11px] text-sf-textMuted">
          Artefatos: <span className="font-mono">{artifactsDir}</span>
        </div>
      )}
      <pre className="text-[11px] text-sf-textSecondary whitespace-pre-wrap break-words font-mono max-h-32 overflow-auto">
        {latestLines(progress) || "Sem saída registrada nesta sessão."}
      </pre>
    </div>
  );
}
