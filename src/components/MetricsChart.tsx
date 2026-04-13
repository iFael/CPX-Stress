/**
 * MetricsChart - Componente de gráfico para métricas do teste de estresse.
 *
 * Exibe dados de desempenho ao longo do tempo em dois formatos:
 *   - Gráfico de area (uma unica métrica, ex: "Requests por Segundo")
 *   - Gráfico de linhas (varias métricas sobrepostas, ex: latencias P50/P95/P99)
 *
 * Usado tanto na tela de progresso ao vivo quanto nos resultados finais.
 */

import { memo, useCallback, useId, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { SecondMetrics } from "@/types";

/* ------------------------------------------------------------------ */
/*  Cores do tema (extraidas do design-system para manter consistencia) */
/* ------------------------------------------------------------------ */

const THEME = {
  /** Fundo do tooltip e do cartao */
  surface: "#1a1d27",
  /** Borda sutil para separacao visual */
  border: "#2a2d3a",
  /** Linhas da grade de fundo do gráfico */
  grid: "#1e2130",
  /** Cor dos rótulos dos eixos X e Y */
  axisLabel: "#64748b",
} as const;

/* ------------------------------------------------------------------ */
/*  Tipos (props do componente)                                       */
/* ------------------------------------------------------------------ */

/** Props para gráfico de area com uma unica métrica */
interface SingleLineProps {
  title: string;
  data: SecondMetrics[];
  dataKey: string;
  color: string;
  /** Sufixo exibido nos valores do tooltip (ex: "ms", "req") */
  unit?: string;
  id: string;
  lines?: never;
  /** Desabilita animações — recomendado para gráficos ao vivo que atualizam a cada segundo */
  animated?: boolean;
}

/** Props para gráfico de linhas com varias métricas sobrepostas */
interface MultiLineProps {
  title: string;
  data: SecondMetrics[];
  lines: { key: string; color: string; label: string }[];
  /** Sufixo exibido nos valores do tooltip (ex: "ms", "req") */
  unit?: string;
  id: string;
  dataKey?: never;
  color?: never;
  /** Desabilita animações — recomendado para gráficos ao vivo que atualizam a cada segundo */
  animated?: boolean;
}

type MetricsChartProps = SingleLineProps | MultiLineProps;

/* ------------------------------------------------------------------ */
/*  Helpers de formatacao                                              */
/* ------------------------------------------------------------------ */

/**
 * Formata números grandes de forma legível.
 * Ex: 1500 -> "1.5k", 23 -> "23"
 */
function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
}

/**
 * Descobre automaticamente a unidade de medida com base no nome do campo.
 * Facilita a leitura para quem não e técnico.
 */
function inferUnit(dataKey: string): string {
  if (dataKey.toLowerCase().includes("latency")) return "ms";
  if (dataKey === "requests") return "req";
  if (dataKey === "errors") return "erros";
  if (dataKey === "activeUsers") return "usuários";
  if (dataKey.includes("bytes") || dataKey.includes("Bytes")) return "bytes";
  return "";
}

/**
 * Traduz nomes técnicos dos campos para rótulos amigaveis em português.
 */
function friendlyLabel(key: string): string {
  const map: Record<string, string> = {
    requests: "Requisições",
    errors: "Erros",
    latencyAvg: "Latência Media",
    latencyP50: "Latência P50 (mediana)",
    latencyP90: "Latência P90",
    latencyP95: "Latência P95",
    latencyP99: "Latência P99",
    latencyMax: "Latência Maxima",
    latencyMin: "Latência Minima",
    activeUsers: "Usuários Ativos",
    bytesReceived: "Bytes Recebidos",
  };
  return map[key] ?? key;
}

/* ------------------------------------------------------------------ */
/*  Tooltip customizado (popup ao passar o mouse sobre o gráfico)     */
/* ------------------------------------------------------------------ */

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    name: string;
    dataKey: string;
    color: string;
  }>;
  label?: number;
  unit?: string;
}

/**
 * Tooltip personalizado que mostra os valores de forma clara e legível.
 * Exibe o segundo do teste e cada métrica com cor, rótulo e unidade.
 */
function CustomTooltip({ active, payload, label, unit }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-sf-surface border border-sf-border rounded-[10px] text-xs text-sf-text py-2.5 px-3.5 shadow-[0_4px_24px_rgba(0,0,0,0.4)] max-w-[260px]">
      {/* Cabeçalho: mostra em qual segundo do teste o usuário está olhando */}
      <p className="text-sf-textSecondary mb-1.5 text-[11px] font-medium tracking-[0.02em]">
        Segundo {label}s do teste
      </p>

      {/* Lista de valores para cada métrica */}
      {payload.map((entry) => {
        const resolvedUnit = unit || inferUnit(entry.dataKey);
        const displayLabel =
          payload.length > 1 ? entry.name : friendlyLabel(entry.dataKey);

        return (
          <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
            {/* Bolinha colorida para identificar a linha — cor dinamica via style */}
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sf-textSecondary text-xs">
              {displayLabel}:
            </span>
            <span className="text-sf-text font-semibold text-xs font-mono">
              {formatNumber(entry.value)}
              {resolvedUnit ? ` ${resolvedUnit}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Legenda customizada para gráficos com multiplas linhas             */
/* ------------------------------------------------------------------ */

interface CustomLegendProps {
  payload?: Array<{
    value: string;
    color: string;
  }>;
}

/**
 * Legenda compacta exibida abaixo do gráfico.
 * Mostra qual cor corresponde a qual métrica.
 */
function CustomLegend({ payload }: CustomLegendProps) {
  if (!payload || payload.length === 0) return null;

  return (
    <div className="flex justify-center flex-wrap gap-4 pt-1">
      {payload.map((entry) => (
        <div
          key={entry.value}
          className="flex items-center gap-1.5 text-[11px] text-sf-textSecondary"
        >
          {/* Barra colorida da legenda — cor dinamica via style */}
          <span
            className="w-2.5 h-[3px] rounded-sm shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          {entry.value}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Componente principal                                               */
/* ------------------------------------------------------------------ */

/**
 * MetricsChart - Gráfico responsivo para exibir métricas do teste.
 *
 * Aceita dois modos de uso:
 *   1. Métrica unica (AreaChart) - passa `dataKey` e `color`
 *   2. Multiplas métricas (LineChart) - passa `lines` com array de métricas
 *
 * @example
 * // Gráfico de area simples (uma métrica)
 * <MetricsChart
 *   title="Requests por Segundo"
 *   data={timeline}
 *   dataKey="requests"
 *   color="#6366f1"
 *   id="rps-chart"
 * />
 *
 * @example
 * // Gráfico de linhas (varias métricas)
 * <MetricsChart
 *   title="Latência (ms)"
 *   data={timeline}
 *   lines={[
 *     { key: 'latencyP50', color: '#22c55e', label: 'P50' },
 *     { key: 'latencyP95', color: '#f59e0b', label: 'P95' },
 *     { key: 'latencyP99', color: '#ef4444', label: 'P99' },
 *   ]}
 *   id="latency-chart"
 * />
 */
// Otimizacao: React.memo impede re-renders desnecessarios quando as props não mudaram.
// Em TestResults, expandir/colapsar seções causaria re-render dos 3 gráficos sem memo.
// O useMemo em displayTimeline (no TestResults) garante referência estável para `data`,
// permitindo que o memo funcione corretamente e pule re-renders de gráficos estaticos.
export const MetricsChart = memo(function MetricsChart(
  props: MetricsChartProps,
) {
  const { title, data, id, unit, animated } = props;

  /* ID único gerado pelo React para o gradiente SVG, evitando duplicatas no DOM */
  const reactId = useId();
  const gradientId = `gradient-${reactId}`;

  /* ---- Propriedades compartilhadas entre os eixos X e Y ---- */

  /** Formata os rótulos do eixo X (ex: "0s", "5s", "10s") */
  const formatXTick = useCallback((value: number) => `${value}s`, []);

  /** Formata os rótulos do eixo Y (números grandes ficam abreviados) */
  const formatYTick = useCallback((value: number) => formatNumber(value), []);

  /* Propriedades comuns ao eixo X */
  const xAxisProps = useMemo(
    () => ({
      dataKey: "second" as const,
      stroke: THEME.axisLabel,
      fontSize: 11,
      tickFormatter: formatXTick,
      tickLine: false,
      axisLine: { stroke: THEME.grid },
      minTickGap: 20,
    }),
    [formatXTick],
  );

  /* Propriedades comuns ao eixo Y */
  const yAxisProps = useMemo(
    () => ({
      stroke: THEME.axisLabel,
      fontSize: 11,
      tickFormatter: formatYTick,
      tickLine: false,
      axisLine: false as const,
      width: 48,
      allowDecimals: false,
    }),
    [formatYTick],
  );

  /* ---- Decide qual tipo de gráfico renderizar ---- */

  const isMultiLine = Boolean(props.lines);

  /** Controla se animações estão ativas (desabilitar para gráficos ao vivo) */
  const shouldAnimate = animated !== false;

  return (
    <div
      id={id}
      className="bg-sf-surface border border-sf-border rounded-xl p-4 transition-colors overflow-hidden"
    >
      {/* Título do gráfico */}
      <h3 className="text-sm font-medium text-sf-textSecondary mb-3 select-none">
        {title}
      </h3>

      {/* Area do gráfico - altura fixa para manter layout consistente */}
      <div className="w-full h-[220px] min-w-0">
        <ResponsiveContainer width="100%" height="100%" debounce={100}>
          {isMultiLine ? (
            /* ============================================= */
            /*  GRÁFICO DE LINHAS (multiplas métricas)       */
            /*  Usado para comparar latencias P50/P95/P99    */
            /* ============================================= */
            <LineChart
              data={data}
              margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={THEME.grid}
                vertical={false}
              />
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip
                content={<CustomTooltip unit={unit} />}
                wrapperStyle={{ zIndex: 50 }}
                cursor={{
                  stroke: THEME.border,
                  strokeWidth: 1,
                  strokeDasharray: "4 4",
                }}
              />
              <Legend content={<CustomLegend />} />

              {/* Renderiza uma linha para cada métrica */}
              {props.lines!.map((line) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  stroke={line.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={shouldAnimate}
                  activeDot={{
                    r: 4,
                    stroke: line.color,
                    strokeWidth: 2,
                    fill: THEME.surface,
                  }}
                  name={line.label}
                />
              ))}
            </LineChart>
          ) : (
            /* ============================================= */
            /*  GRÁFICO DE AREA (métrica unica)              */
            /*  Usado para requests/s e erros/s              */
            /* ============================================= */
            <AreaChart
              data={data}
              margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
            >
              {/* Gradiente de preenchimento - vai da cor principal até transparente */}
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={props.color}
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="95%"
                    stopColor={props.color}
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke={THEME.grid}
                vertical={false}
              />
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip
                content={<CustomTooltip unit={unit} />}
                wrapperStyle={{ zIndex: 50 }}
                cursor={{
                  stroke: THEME.border,
                  strokeWidth: 1,
                  strokeDasharray: "4 4",
                }}
              />

              {/* Area preenchida com gradiente e linha de contorno */}
              <Area
                type="monotone"
                dataKey={props.dataKey!}
                stroke={props.color}
                fill={`url(#${gradientId})`}
                strokeWidth={2}
                isAnimationActive={shouldAnimate}
                activeDot={{
                  r: 4,
                  stroke: props.color,
                  strokeWidth: 2,
                  fill: THEME.surface,
                }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
});
