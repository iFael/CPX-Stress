/**
 * CrossTestAnalysis.tsx - Pagina de analise comparativa de erros entre testes
 *
 * Permite ao usuario selecionar 2-5 testes do historico e comparar a
 * distribuicao de erros por operacao. Exibe uma tabela comparativa com
 * indicadores de tendencia (degradacao/melhoria) e um grafico de barras
 * agrupadas (Recharts) para visualizacao rapida de padroes.
 *
 * Dados: reutiliza `window.stressflow.errors.byOperationName(testId)` e
 * `useTestStore((s) => s.history)` — nenhum IPC novo necessario.
 *
 * Estado: totalmente local (useState/useMemo/useCallback) — nao polui
 * o Zustand store com dados efemeros de comparacao.
 */

import { useState, useMemo, useCallback } from "react";
import {
  BarChart3,
  Search,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useTestStore } from "@/stores/test-store";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { TestResult } from "@/types";

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

/** Paleta de cores para as barras do grafico (uma cor por teste selecionado) */
const CHART_COLORS = [
  "#6366f1", // sf-primary (indigo) — Test 1
  "#22d3ee", // sf-accent (cyan) — Test 2
  "#22c55e", // sf-success (green) — Test 3
  "#f59e0b", // sf-warning (amber) — Test 4
  "#3b82f6", // sf-info (blue) — Test 5
] as const;

/** Cores do tema para eixos e grade do grafico */
const THEME = {
  surface: "#1a1d27",
  border: "#2a2d3a",
  grid: "#1e2130",
  axisLabel: "#64748b",
} as const;

/** Minimo de testes necessarios para habilitar comparacao */
const MIN_SELECTED_TESTS = 2;

/** Maximo de testes que podem ser selecionados simultaneamente */
const MAX_SELECTED_TESTS = 5;

/* ------------------------------------------------------------------ */
/*  Tipos internos                                                     */
/* ------------------------------------------------------------------ */

/** Dados de comparacao carregados via IPC para cada teste selecionado */
interface ComparisonEntry {
  testId: string;
  label: string;
  startTime: string;
  data: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/*  Funcoes auxiliares                                                  */
/* ------------------------------------------------------------------ */

/**
 * Gera um rotulo curto para o teste exibido nos cabecalhos da tabela e legenda.
 * Formato: "dd/MM HHh — N VUs"
 */
function buildTestLabel(test: TestResult): string {
  return (
    format(new Date(test.startTime), "dd/MM HH'h'", { locale: ptBR }) +
    " \u2014 " +
    test.config.virtualUsers +
    " VUs"
  );
}

/**
 * Transforma os dados de comparacao em formato flat para o Recharts BarChart.
 * Cada linha representa uma operacao; cada propriedade e a contagem de erros
 * para um teste especifico.
 *
 * Ordena por total de erros descendente (operacao com mais erros no topo).
 * Mapeia "default" para "Requisicao Unica" (pitfall #2).
 */
function buildChartData(
  testResults: ComparisonEntry[],
): Array<Record<string, unknown>> {
  const allOps = new Set<string>();
  for (const t of testResults) {
    for (const op of Object.keys(t.data)) allOps.add(op);
  }

  return Array.from(allOps)
    .map((op) => {
      const displayName = op === "default" ? "Requisicao Unica" : op;
      const row: Record<string, unknown> = { operation: displayName };
      let total = 0;
      for (const t of testResults) {
        row[t.testId] = t.data[op] ?? 0;
        total += t.data[op] ?? 0;
      }
      row._total = total;
      return row;
    })
    .sort((a, b) => (b._total as number) - (a._total as number));
}

/**
 * Computa a tendencia (degradacao/melhoria) entre dois valores consecutivos.
 * Quando previous === 0 e current > 0, retorna "novo" em vez de Infinity%.
 */
function computeTrend(
  current: number,
  previous: number,
): { delta: number; direction: "up" | "down" | "neutral"; label: string } {
  if (previous === 0 && current === 0)
    return { delta: 0, direction: "neutral", label: "" };
  if (previous === 0 && current > 0)
    return { delta: 0, direction: "up", label: "novo" };
  const pct = ((current - previous) / previous) * 100;
  if (pct > 0)
    return {
      delta: Math.round(pct),
      direction: "up",
      label: `+${Math.round(pct)}%`,
    };
  if (pct < 0)
    return {
      delta: Math.round(Math.abs(pct)),
      direction: "down",
      label: `-${Math.round(Math.abs(pct))}%`,
    };
  return { delta: 0, direction: "neutral", label: "" };
}

/* ------------------------------------------------------------------ */
/*  Componentes internos do grafico                                    */
/* ------------------------------------------------------------------ */

/** Props do tooltip customizado do Recharts */
interface ComparisonTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    name: string;
    color: string;
    dataKey: string;
  }>;
  label?: string;
}

/**
 * Tooltip personalizado para o grafico de barras comparativo.
 * Segue exatamente o padrao do MetricsChart.tsx CustomTooltip.
 */
function ComparisonTooltip({ active, payload, label }: ComparisonTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-sf-surface border border-sf-border rounded-[10px] text-xs text-sf-text py-2.5 px-3.5 shadow-[0_4px_24px_rgba(0,0,0,0.4)] max-w-[260px]">
      <p className="text-sf-textSecondary mb-1.5 text-[11px] font-medium tracking-[0.02em]">
        {label}
      </p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sf-textSecondary text-xs">{entry.name}:</span>
          <span className="text-sf-text font-semibold text-xs font-mono">
            {entry.value} erros
          </span>
        </div>
      ))}
    </div>
  );
}

/** Props da legenda customizada do Recharts */
interface ComparisonLegendProps {
  payload?: Array<{
    value: string;
    color: string;
  }>;
}

/**
 * Legenda compacta abaixo do grafico.
 * Segue exatamente o padrao do MetricsChart.tsx CustomLegend.
 */
function ComparisonLegend({ payload }: ComparisonLegendProps) {
  if (!payload || payload.length === 0) return null;

  return (
    <div className="flex justify-center flex-wrap gap-4 pt-1">
      {payload.map((entry) => (
        <div
          key={entry.value}
          className="flex items-center gap-1.5 text-[11px] text-sf-textSecondary"
        >
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

export function CrossTestAnalysis() {
  // --- Estado local (efemero — nao vai para o Zustand) ---
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [comparisonData, setComparisonData] = useState<
    ComparisonEntry[] | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Dados do store (somente leitura) ---
  const history = useTestStore((s) => s.history);

  // --- Pipeline de filtragem e ordenacao dos testes ---
  const processedResults = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    const results = history.filter((t) => {
      if (!searchLower) return true;
      return t.url.toLowerCase().includes(searchLower);
    });
    const sorted = [...results];
    sorted.sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
    return sorted;
  }, [history, search]);

  // --- Toggle de selecao de testes ---
  const toggleTestSelection = useCallback(
    (testId: string) => {
      setSelectedTestIds((prev) => {
        if (prev.includes(testId)) {
          return prev.filter((id) => id !== testId);
        }
        if (prev.length >= MAX_SELECTED_TESTS) return prev;
        return [...prev, testId];
      });
      // Reset comparison data quando a selecao muda (forca re-fetch)
      setComparisonData(null);
      setError(null);
    },
    [],
  );

  // --- Carregamento dos dados de comparacao ---
  const handleCompare = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        selectedTestIds.map((id) => {
          const test = history.find((t) => t.id === id);
          return window.stressflow.errors
            .byOperationName(id)
            .then((data) => ({
              testId: id,
              label: test ? buildTestLabel(test) : id,
              startTime: test?.startTime ?? "",
              data,
            }));
        }),
      );
      // Ordenar por startTime ascendente (mais antigo primeiro)
      results.sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
      setComparisonData(results);
    } catch {
      setError(
        "Falha ao carregar dados de erros. Verifique se os testes selecionados ainda existem no historico e tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }, [selectedTestIds, history]);

  // --- Dados derivados para tabela e grafico ---
  const chartData = useMemo(() => {
    if (!comparisonData) return [];
    return buildChartData(comparisonData);
  }, [comparisonData]);

  const allZeroErrors = useMemo(() => {
    if (!comparisonData) return false;
    return comparisonData.every(
      (t) =>
        Object.keys(t.data).length === 0 ||
        Object.values(t.data).every((v) => v === 0),
    );
  }, [comparisonData]);

  // --- Flags de controle da UI ---
  const canCompare = selectedTestIds.length >= MIN_SELECTED_TESTS;
  const isMaxSelected = selectedTestIds.length >= MAX_SELECTED_TESTS;

  // --- Renderizacao ---
  return (
    <div
      role="region"
      aria-label="Analise cross-test"
      className="animate-slide-up space-y-8"
    >
      {/* ---- Cabecalho da pagina ---- */}
      <div>
        <h2 className="text-xl font-bold text-sf-text">
          Analise Cross-Test
        </h2>
        <p className="text-sm text-sf-textSecondary mt-1">
          Compare a distribuicao de erros entre testes para identificar
          degradacao
        </p>
      </div>

      {/* ---- Empty state: nenhum teste no historico ---- */}
      {history.length === 0 ? (
        <div className="bg-sf-surface border border-sf-border rounded-xl p-8 text-center">
          <AlertCircle
            className="w-10 h-10 text-sf-textMuted mx-auto mb-3"
            aria-hidden="true"
          />
          <h3 className="text-sm font-bold text-sf-text">
            Nenhum teste no historico
          </h3>
          <p className="text-sm text-sf-textSecondary mt-1 max-w-md mx-auto">
            Execute ao menos dois testes de estresse para poder comparar a
            distribuicao de erros entre eles.
          </p>
        </div>
      ) : (
        <>
          {/* ---- Painel seletor de testes ---- */}
          <div className="bg-sf-surface border border-sf-border rounded-xl p-4 space-y-3">
            {/* Campo de busca */}
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sf-textMuted pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por URL..."
                className="bg-sf-bg border border-sf-border rounded-lg px-3 py-2 text-sm text-sf-text placeholder:text-sf-textMuted w-full pl-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary focus-visible:ring-offset-1"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sf-textMuted hover:text-sf-text transition-colors"
                  aria-label="Limpar busca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Lista de testes com checkboxes */}
            <div className="max-h-64 overflow-y-auto space-y-1">
              {processedResults.map((test) => {
                const isSelected = selectedTestIds.includes(test.id);
                const isDisabled = !isSelected && isMaxSelected;

                return (
                  <label
                    key={test.id}
                    className={
                      "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors " +
                      (isDisabled
                        ? "opacity-40 cursor-not-allowed"
                        : "cursor-pointer hover:bg-sf-surfaceHover") +
                      (isSelected
                        ? " bg-sf-primary/5 border border-sf-primary/20"
                        : "")
                    }
                  >
                    {/* Checkbox oculto + visual customizado */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => toggleTestSelection(test.id)}
                      className="sr-only"
                    />
                    <span
                      className={
                        "w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors " +
                        (isSelected
                          ? "bg-sf-primary border-sf-primary"
                          : "border-sf-border")
                      }
                      aria-hidden="true"
                    >
                      {isSelected && (
                        <svg
                          className="w-3 h-3 text-white"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M2 6l3 3 5-5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>

                    {/* URL truncada */}
                    <span className="truncate max-w-[200px] text-sm text-sf-text">
                      {test.url}
                    </span>

                    {/* Data formatada */}
                    <span className="text-xs text-sf-textMuted whitespace-nowrap">
                      {format(new Date(test.startTime), "dd/MM HH:mm", {
                        locale: ptBR,
                      })}
                    </span>

                    {/* Badge de erros */}
                    {test.totalErrors > 0 ? (
                      <span className="text-xs bg-sf-danger/10 text-sf-danger px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        {test.totalErrors} erros
                      </span>
                    ) : (
                      <span className="text-xs text-sf-success/70 whitespace-nowrap">
                        0 erros
                      </span>
                    )}

                    {/* Contagem de VUs */}
                    <span className="text-sf-textMuted text-xs whitespace-nowrap ml-auto">
                      {test.config.virtualUsers} VUs
                    </span>
                  </label>
                );
              })}

              {/* Sem resultados de busca */}
              {processedResults.length === 0 && search && (
                <p className="text-sm text-sf-textMuted text-center py-4">
                  Nenhum teste encontrado para &quot;{search}&quot;
                </p>
              )}
            </div>

            {/* Rodape: contador + botao CTA */}
            <div className="flex items-center justify-between pt-2 border-t border-sf-border">
              <div>
                <p
                  className="text-xs text-sf-textSecondary"
                  aria-live="polite"
                >
                  {selectedTestIds.length < MIN_SELECTED_TESTS
                    ? `${selectedTestIds.length} de ${MIN_SELECTED_TESTS} testes selecionados`
                    : `${selectedTestIds.length} de ${processedResults.length} testes selecionados`}
                </p>
                {isMaxSelected && (
                  <p className="text-xs text-sf-textMuted mt-0.5">
                    Maximo de 5 testes para comparacao
                  </p>
                )}
              </div>

              <button
                type="button"
                disabled={!canCompare || loading}
                onClick={handleCompare}
                className={
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all " +
                  (canCompare && !loading
                    ? "bg-sf-primary hover:bg-sf-primaryHover text-white"
                    : "opacity-50 cursor-not-allowed bg-sf-primary/50 text-white")
                }
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2
                      className="w-4 h-4 animate-spin"
                      aria-hidden="true"
                    />
                    Carregando...
                  </span>
                ) : canCompare ? (
                  "Comparar Testes"
                ) : (
                  "Selecione ao menos 2 testes"
                )}
              </button>
            </div>
          </div>

          {/* ---- Secao de comparacao (renderizada apos clicar em Comparar) ---- */}

          {/* Estado de carregamento */}
          {loading && !comparisonData && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2
                className="w-8 h-8 text-sf-primary animate-spin"
                aria-hidden="true"
              />
              <p className="text-sm text-sf-textSecondary">
                Carregando dados de erros...
              </p>
            </div>
          )}

          {/* Estado de erro */}
          {error && (
            <div className="bg-sf-surface border border-sf-border rounded-xl p-6 text-center">
              <AlertCircle
                className="w-8 h-8 text-sf-danger mx-auto mb-2"
                aria-hidden="true"
              />
              <p className="text-sm text-sf-danger">{error}</p>
            </div>
          )}

          {/* Empty state: nenhum erro nos testes selecionados */}
          {comparisonData && !loading && allZeroErrors && (
            <div className="bg-sf-surface border border-sf-border rounded-xl p-8 text-center animate-fade-in">
              <CheckCircle2
                className="w-10 h-10 text-sf-success mx-auto mb-3"
                aria-hidden="true"
              />
              <h3 className="text-sm font-bold text-sf-text">
                Nenhum erro encontrado
              </h3>
              <p className="text-sm text-sf-textSecondary mt-1 max-w-md mx-auto">
                Os testes selecionados nao registraram erros. Isso indica que o
                servidor respondeu corretamente a todas as requisicoes.
              </p>
            </div>
          )}

          {/* ---- Tabela comparativa + grafico ---- */}
          {comparisonData &&
            !loading &&
            !allZeroErrors &&
            chartData.length > 0 && (
              <div className="space-y-6 animate-fade-in">
                {/* Tabela de comparacao */}
                <div className="bg-sf-surface border border-sf-border rounded-xl overflow-hidden">
                  <h3 className="text-sm font-bold text-sf-textSecondary px-4 pt-4 pb-2">
                    Comparacao de Erros por Operacao
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-sf-bg text-sf-textSecondary text-xs font-bold">
                          <th
                            scope="col"
                            className="text-left px-4 py-2.5"
                          >
                            Operacao
                          </th>
                          {comparisonData.map((test) => (
                            <th
                              key={test.testId}
                              scope="col"
                              className="text-left px-4 py-2.5"
                            >
                              {test.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sf-border">
                        {chartData.map((row) => (
                          <tr
                            key={row.operation as string}
                            className="hover:bg-sf-surfaceHover/50 transition-colors"
                          >
                            <th
                              scope="row"
                              className="text-sm text-sf-text font-medium px-4 py-2.5 text-left"
                              title={row.operation as string}
                            >
                              {(row.operation as string).length > 20
                                ? (row.operation as string).slice(0, 20) +
                                  "..."
                                : (row.operation as string)}
                            </th>

                            {comparisonData.map((test, colIndex) => {
                              const count = (row[test.testId] as number) ?? 0;
                              const prevTest =
                                colIndex > 0
                                  ? comparisonData[colIndex - 1]
                                  : null;
                              const prevCount = prevTest
                                ? ((row[prevTest.testId] as number) ?? 0)
                                : 0;
                              const trend =
                                colIndex > 0
                                  ? computeTrend(count, prevCount)
                                  : null;

                              const bgClass =
                                trend?.direction === "up"
                                  ? "bg-sf-danger/10"
                                  : trend?.direction === "down"
                                    ? "bg-sf-success/10"
                                    : "";

                              const textClass =
                                trend?.direction === "up"
                                  ? "text-sf-danger"
                                  : trend?.direction === "down"
                                    ? "text-sf-success"
                                    : "text-sf-text";

                              return (
                                <td
                                  key={test.testId}
                                  className={`px-4 py-2.5 ${bgClass}`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    {count === 0 ? (
                                      <span className="text-sf-textMuted font-mono text-sm">
                                        &mdash;
                                      </span>
                                    ) : (
                                      <span
                                        className={`font-mono text-sm ${textClass}`}
                                      >
                                        {count}
                                      </span>
                                    )}

                                    {trend &&
                                      trend.direction === "up" &&
                                      count > 0 && (
                                        <>
                                          <TrendingUp
                                            className="w-4 h-4 text-sf-danger"
                                            aria-hidden="true"
                                          />
                                          <span className="text-xs text-sf-danger">
                                            {trend.label}
                                          </span>
                                          <span className="sr-only">
                                            {trend.label === "novo"
                                              ? "Erro novo em relacao ao teste anterior"
                                              : `Aumento de ${trend.delta}% em relacao ao teste anterior`}
                                          </span>
                                        </>
                                      )}

                                    {trend &&
                                      trend.direction === "down" &&
                                      count > 0 && (
                                        <>
                                          <TrendingDown
                                            className="w-4 h-4 text-sf-success"
                                            aria-hidden="true"
                                          />
                                          <span className="text-xs text-sf-success">
                                            {trend.label}
                                          </span>
                                          <span className="sr-only">
                                            Reducao de {trend.delta}% em
                                            relacao ao teste anterior
                                          </span>
                                        </>
                                      )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Grafico de barras agrupadas */}
                <div
                  className="bg-sf-surface border border-sf-border rounded-xl p-4"
                  aria-label={`Grafico de barras comparando erros por operacao entre ${comparisonData.length} testes`}
                >
                  <h3 className="text-sm font-bold text-sf-textSecondary mb-4">
                    Erros por Operacao
                  </h3>

                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={chartData}
                      barGap={2}
                      barCategoryGap="20%"
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={THEME.grid}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="operation"
                        stroke={THEME.axisLabel}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        angle={-30}
                        textAnchor="end"
                        height={60}
                        tickFormatter={(value: string) =>
                          value.length > 12
                            ? value.slice(0, 12) + "..."
                            : value
                        }
                      />
                      <YAxis
                        stroke={THEME.axisLabel}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip content={<ComparisonTooltip />} />
                      <Legend content={<ComparisonLegend />} />
                      {comparisonData.map((test, i) => (
                        <Bar
                          key={test.testId}
                          dataKey={test.testId}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                          name={test.label}
                          radius={[2, 2, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
        </>
      )}
    </div>
  );
}
