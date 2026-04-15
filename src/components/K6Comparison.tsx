import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Scale,
} from "lucide-react";
import { useK6 } from "@/hooks/useK6";
import { formatMs } from "@/shared/test-analysis";
import type { K6Config } from "@/types";

interface ComparisonInput {
  avgLatency: number;
  p90Latency: number;
  p95Latency: number;
  p99Latency: number;
  rps: number;
  errorRate: number;
}

interface K6ComparisonProps {
  cpxResult: ComparisonInput;
  config: K6Config;
}

interface ComparisonRow {
  label: string;
  cpx: number;
  k6: number | null;
  unit: string;
  delta: string;
  tone: "aligned" | "warning" | "danger" | "neutral";
}

function formatValue(value: number, unit: string): string {
  if (unit === "ms") return formatMs(value);
  if (unit === "%") {
    return `${value.toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}%`;
  }
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })} ${unit}`.trim();
}

function compareRelativeDelta(
  baseline: number,
  other: number,
  alignedPercent: number,
  warningPercent: number,
): ComparisonRow["tone"] {
  if (baseline === 0 && other === 0) return "aligned";
  if (baseline === 0 || other === 0) return "danger";

  const relative = Math.abs((other - baseline) / baseline) * 100;
  if (relative <= alignedPercent) return "aligned";
  if (relative <= warningPercent) return "warning";
  return "danger";
}

function compareAbsoluteDelta(
  baseline: number,
  other: number,
  alignedDelta: number,
  warningDelta: number,
): ComparisonRow["tone"] {
  const delta = Math.abs(other - baseline);
  if (delta <= alignedDelta) return "aligned";
  if (delta <= warningDelta) return "warning";
  return "danger";
}

function buildDeltaLabel(
  baseline: number,
  other: number | null,
  unit: string,
): string {
  if (other === null) return "—";

  const delta = other - baseline;
  const prefix = delta > 0 ? "+" : "";

  if (unit === "%") {
    return `${prefix}${delta.toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} p.p.`;
  }

  return `${prefix}${delta.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: unit === "req/s" ? 2 : 1,
  })} ${unit}`.trim();
}

function toneClass(tone: ComparisonRow["tone"]): string {
  if (tone === "aligned") return "text-sf-success";
  if (tone === "warning") return "text-sf-warning";
  if (tone === "danger") return "text-sf-danger";
  return "text-sf-textMuted";
}

export function K6Comparison({ cpxResult, config }: K6ComparisonProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const { status, summary, error, progress, run } = useK6();

  useEffect(() => {
    let cancelled = false;

    setAvailable(null);

    window.stressflow
      .k6Check()
      .then((isAvailable) => {
        if (!cancelled) {
          setAvailable(isAvailable);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailable(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [config.duration, config.url, config.vus]);

  const rows = useMemo<ComparisonRow[]>(() => {
    const k6ErrorRate = summary ? summary.errorRate * 100 : null;

    return [
      {
        label: "Avg latência",
        cpx: cpxResult.avgLatency,
        k6: summary?.avgLatency ?? null,
        unit: "ms",
        delta: buildDeltaLabel(cpxResult.avgLatency, summary?.avgLatency ?? null, "ms"),
        tone:
          summary !== null
            ? compareRelativeDelta(cpxResult.avgLatency, summary.avgLatency, 10, 20)
            : "neutral",
      },
      {
        label: "p90",
        cpx: cpxResult.p90Latency,
        k6: summary?.p90Latency ?? null,
        unit: "ms",
        delta: buildDeltaLabel(cpxResult.p90Latency, summary?.p90Latency ?? null, "ms"),
        tone:
          summary !== null
            ? compareRelativeDelta(cpxResult.p90Latency, summary.p90Latency, 10, 20)
            : "neutral",
      },
      {
        label: "p95",
        cpx: cpxResult.p95Latency,
        k6: summary?.p95Latency ?? null,
        unit: "ms",
        delta: buildDeltaLabel(cpxResult.p95Latency, summary?.p95Latency ?? null, "ms"),
        tone:
          summary !== null
            ? compareRelativeDelta(cpxResult.p95Latency, summary.p95Latency, 15, 25)
            : "neutral",
      },
      {
        label: "p99",
        cpx: cpxResult.p99Latency,
        k6: summary?.p99Latency ?? null,
        unit: "ms",
        delta: buildDeltaLabel(cpxResult.p99Latency, summary?.p99Latency ?? null, "ms"),
        tone:
          summary !== null
            ? compareRelativeDelta(cpxResult.p99Latency, summary.p99Latency, 15, 25)
            : "neutral",
      },
      {
        label: "RPS",
        cpx: cpxResult.rps,
        k6: summary?.rps ?? null,
        unit: "req/s",
        delta: buildDeltaLabel(cpxResult.rps, summary?.rps ?? null, "req/s"),
        tone:
          summary !== null
            ? compareRelativeDelta(cpxResult.rps, summary.rps, 5, 10)
            : "neutral",
      },
      {
        label: "Error rate",
        cpx: cpxResult.errorRate,
        k6: k6ErrorRate,
        unit: "%",
        delta: buildDeltaLabel(cpxResult.errorRate, k6ErrorRate, "%"),
        tone:
          k6ErrorRate !== null
            ? compareAbsoluteDelta(cpxResult.errorRate, k6ErrorRate, 2, 5)
            : "neutral",
      },
    ];
  }, [cpxResult, summary]);

  return (
    <div className="bg-sf-surface border border-sf-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-sf-text flex items-center gap-2">
            <Scale className="w-4 h-4 text-sf-primary" />
            Comparação com k6
          </h3>
          <p className="text-xs text-sf-textMuted">
            Usa o mesmo fluxo/config do teste para validar se as métricas do
            CPX-Stress batem com um benchmark externo.
          </p>
        </div>

        {status !== "running" ? (
          <button
            type="button"
            onClick={() => run(config)}
            disabled={available === false}
            className="text-xs px-3 py-2 rounded-lg bg-sf-primary hover:bg-sf-primaryHover text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {status === "done" ? "Rodar novamente" : "Comparar com k6"}
          </button>
        ) : (
          <span className="text-xs text-sf-primary flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Executando k6...
          </span>
        )}
      </div>

      {available === false && (
        <div className="text-xs text-sf-warning bg-sf-warning/10 border border-sf-warning/30 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            O binário do k6 não está disponível nesta máquina. Instale o k6 ou
            configure `K6_PATH` para habilitar a comparação.
          </span>
        </div>
      )}

      {error && (
        <div className="text-xs text-sf-danger bg-sf-danger/10 border border-sf-danger/30 rounded-lg p-3">
          {error}
        </div>
      )}

      {summary && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-0.5 rounded-full bg-sf-primary/10 text-sf-primary border border-sf-primary/30">
              {summary.version}
            </span>
            {summary.totalReqs > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-sf-success/10 text-sf-success border border-sf-success/30">
                {summary.totalReqs.toLocaleString("pt-BR")} requests
              </span>
            )}
            {summary.artifactsDir && (
              <span className="text-sf-textMuted">
                Artefatos:{" "}
                <span className="font-mono text-sf-textSecondary">
                  {summary.artifactsDir}
                </span>
              </span>
            )}
          </div>

          <table className="w-full text-xs text-sf-textSecondary">
            <thead>
              <tr className="text-sf-textMuted border-b border-sf-border">
                <th className="text-left py-1.5">Métrica</th>
                <th className="text-right py-1.5">CPX-Stress</th>
                <th className="text-right py-1.5">k6</th>
                <th className="text-right py-1.5">Delta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-sf-border/50">
                  <td className="py-2 text-sf-text">{row.label}</td>
                  <td className="py-2 text-right font-mono">
                    {formatValue(row.cpx, row.unit)}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {row.k6 !== null ? formatValue(row.k6, row.unit) : "—"}
                  </td>
                  <td className={`py-2 text-right font-mono ${toneClass(row.tone)}`}>
                    {row.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {progress.length > 0 && (
            <div className="rounded-lg border border-sf-border bg-sf-bg/40 p-3">
              <div className="text-[11px] text-sf-textMuted mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Última saída do k6
              </div>
              <pre className="text-[11px] text-sf-textSecondary whitespace-pre-wrap break-words font-mono max-h-32 overflow-auto">
                {progress.slice(-10).join("")}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
