/**
 * HistoryPanel.tsx
 *
 * Painel de histórico de testes -- exibe todos os testes já realizados,
 * permitindo buscar, filtrar, ordenar e revisitar resultados anteriores.
 *
 * Funcionalidades:
 *  - Busca por URL ou método HTTP
 *  - Filtro por status (concluido, cancelado, erro)
 *  - Ordenacao por data, RPS, taxa de erros ou nota de saude
 *  - Agrupamento visual por período (hoje, ontem, está semana, anteriores)
 *  - Exclusão individual com confirmação e limpeza total do histórico
 *  - Acessibilidade completa via teclado e leitores de tela
 */

import { useState, useMemo, useCallback, useRef, useEffect, memo } from "react";
import {
  Trash2,
  Eye,
  Search,
  Calendar,
  Clock,
  Activity,
  Trash,
  ArrowUpDown,
  Filter,
  X,
  Users,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useTestStore } from "@/stores/test-store";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { TestResult } from "@/types";

/* =========================================================================
   Tipos auxiliares
   ========================================================================= */

/** Opcoes de ordenacao disponiveis para a lista */
type SortOption =
  | "date-desc"
  | "date-asc"
  | "rps-desc"
  | "errors-desc"
  | "health-desc";

/** Filtro por status do teste */
type StatusFilter = "all" | "completed" | "cancelled" | "error";

/** Rótulos legíveis para cada opcao de ordenacao */
const SORT_LABELS: Record<SortOption, string> = {
  "date-desc": "Mais recentes",
  "date-asc": "Mais antigos",
  "rps-desc": "Maior RPS",
  "errors-desc": "Mais erros",
  "health-desc": "Melhor saúde",
};

/** Rótulos legiveis para cada filtro de status */
const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "Todos",
  completed: "Concluídos",
  cancelled: "Cancelados",
  error: "Com erro",
};

/* =========================================================================
   Função utilitaria -- cálculo rapido de "nota de saude" do teste
   (usada para o indicador colorido e para ordenacao)
   ========================================================================= */

function getQuickScore(result: TestResult): number {
  // Falha total: todas as requisições falharam ou taxa de erro >= 95%
  if (
    result.errorRate >= 95 ||
    (result.totalRequests === result.totalErrors && result.latency.avg === 0)
  ) {
    return 0;
  }

  let score = 100;

  // Penalidade proporcional a taxa de erros
  if (result.errorRate > 50) score -= 60;
  else if (result.errorRate > 5) score -= 25;

  // Penalidade se a latência P95 for alta (site demorou pra responder)
  if (result.latency.p95 > 5000) score -= 20;
  else if (result.latency.p95 > 2000) score -= 10;

  // Penalidade quando nenhum byte foi recebido (possível bloqueio total)
  if (result.totalBytes === 0 && result.totalRequests > 0) score -= 30;

  return Math.max(0, score);
}

/**
 * Retorna a cor CSS correspondente a nota de saude.
 * Verde >= 80  |  Amarelo >= 40  |  Vermelho < 40
 */
function getScoreColor(score: number): string {
  if (score >= 80) return "bg-sf-success";
  if (score >= 40) return "bg-sf-warning";
  return "bg-sf-danger";
}

/**
 * Retorna um rótulo acessível descrevendo a nota de saude para leitores de tela.
 */
function getScoreLabel(score: number): string {
  if (score >= 80) return "Saúde boa";
  if (score >= 40) return "Saúde regular";
  return "Saúde crítica";
}

/* =========================================================================
   Função utilitaria -- agrupamento por período
   ========================================================================= */

interface DateGroup {
  label: string;
  items: TestResult[];
}

/**
 * Agrupa os testes por período (Hoje, Ontem, Está semana, Anteriores)
 * para facilitar a navegação visual na lista.
 */
function groupByDate(results: TestResult[]): DateGroup[] {
  const groups: Record<string, TestResult[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  };

  for (const result of results) {
    const date = new Date(result.startTime);
    if (isToday(date)) {
      groups.today.push(result);
    } else if (isYesterday(date)) {
      groups.yesterday.push(result);
    } else if (isThisWeek(date)) {
      groups.thisWeek.push(result);
    } else {
      groups.older.push(result);
    }
  }

  const output: DateGroup[] = [];
  if (groups.today.length > 0)
    output.push({ label: "Hoje", items: groups.today });
  if (groups.yesterday.length > 0)
    output.push({ label: "Ontem", items: groups.yesterday });
  if (groups.thisWeek.length > 0)
    output.push({ label: "Está semana", items: groups.thisWeek });
  if (groups.older.length > 0)
    output.push({ label: "Anteriores", items: groups.older });
  return output;
}

/* =========================================================================
   Componente principal -- HistoryPanel
   ========================================================================= */

export function HistoryPanel() {
  /* --- Estado global (store Zustand) --- */
  const history = useTestStore((s) => s.history);
  const setHistory = useTestStore((s) => s.setHistory);
  const setCurrentResult = useTestStore((s) => s.setCurrentResult);
  const setView = useTestStore((s) => s.setView);
  const setStatus = useTestStore((s) => s.setStatus);

  /* --- Estado local do painel --- */
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date-desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  /* Referência para fechar menus ao clicar fora */
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Otimizacao: useRef para armazenar IDs de setTimeout pendentes.
  // Sem isso, se o componente desmontar antes do timeout expirar,
  // o callback tentaria atualizar estado de um componente desmontado,
  // causando um vazamento de memória (a closure mantém referencias vivas).
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpa timeouts pendentes ao desmontar o componente
  useEffect(() => {
    return () => {
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    };
  }, []);

  /* --- Fechar menus dropdown ao clicar fora deles ou pressionar Escape --- */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        sortMenuRef.current &&
        !sortMenuRef.current.contains(event.target as Node)
      ) {
        setShowSortMenu(false);
      }
      if (
        filterMenuRef.current &&
        !filterMenuRef.current.contains(event.target as Node)
      ) {
        setShowFilterMenu(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowSortMenu(false);
        setShowFilterMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  /* --- Pipeline: filtrar -> ordenar --- */
  const processedResults = useMemo(() => {
    const searchLower = search.toLowerCase().trim();

    // 1. Filtrar por texto de busca (URL ou método HTTP)
    let results = history.filter((t) => {
      if (!searchLower) return true;
      return (
        t.url.toLowerCase().includes(searchLower) ||
        t.config.method.toLowerCase().includes(searchLower)
      );
    });

    // 2. Filtrar por status (concluido, cancelado, erro)
    if (statusFilter !== "all") {
      results = results.filter((t) => t.status === statusFilter);
    }

    // 3. Ordenar conforme a opcao selecionada
    const sorted = [...results];
    switch (sortBy) {
      case "date-desc":
        sorted.sort(
          (a, b) =>
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
        );
        break;
      case "date-asc":
        sorted.sort(
          (a, b) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
        );
        break;
      case "rps-desc":
        sorted.sort((a, b) => b.rps - a.rps);
        break;
      case "errors-desc":
        sorted.sort((a, b) => b.errorRate - a.errorRate);
        break;
      case "health-desc":
        sorted.sort((a, b) => getQuickScore(b) - getQuickScore(a));
        break;
    }

    return sorted;
  }, [history, search, statusFilter, sortBy]);

  /* Agrupar por data apenas quando ordenado cronologicamente */
  const dateGroups = useMemo(() => {
    if (sortBy === "date-desc" || sortBy === "date-asc") {
      return groupByDate(processedResults);
    }
    return null;
  }, [processedResults, sortBy]);

  /* --- Indicadores para contagem de filtro ativo --- */
  const hasActiveFilters = statusFilter !== "all" || search.length > 0;

  /* -----------------------------------------------------------------------
     Handlers -- ações do usuário
     ----------------------------------------------------------------------- */

  /** Abre os detalhes de um teste específico */
  const handleView = useCallback(
    (result: TestResult) => {
      setCurrentResult(result);
      setStatus("completed");
      setView("results");
    },
    [setCurrentResult, setStatus, setView],
  );

  /** Exclui um teste individual (com confirmação inline) */
  const handleDelete = useCallback(
    async (id: string) => {
      // Primeiro clique: pede confirmação
      if (deletingId !== id) {
        setDeletingId(id);
        // Otimizacao: armazena o timeout no ref para poder limpa-lo ao desmontar
        if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
        deleteTimeoutRef.current = setTimeout(
          () => setDeletingId((current) => (current === id ? null : current)),
          3000,
        );
        return;
      }
      // Segundo clique: efetiva a exclusão
      setBusyDeleteId(id);
      try {
        await window.stressflow.history.delete(id);
        setHistory(history.filter((t) => t.id !== id));
      } catch (err) {
        console.warn("[CPX-Stress] Falha ao excluir teste:", err);
      }
      setBusyDeleteId(null);
      setDeletingId(null);
    },
    [deletingId, history, setHistory],
  );

  /** Limpa todo o histórico (com confirmação em dois cliques) */
  const handleClearAll = useCallback(async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      // Otimizacao: armazena o timeout no ref para poder limpa-lo ao desmontar
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    setClearingAll(true);
    try {
      await window.stressflow.history.clear();
      setHistory([]);
    } catch (err) {
      console.warn("[CPX-Stress] Falha ao limpar histórico:", err);
    }
    setClearingAll(false);
    setConfirmClear(false);
  }, [confirmClear, setHistory]);

  /** Limpa todos os filtros ativos de uma vez */
  const handleClearFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
  }, []);

  /* -----------------------------------------------------------------------
     Renderização
     ----------------------------------------------------------------------- */

  return (
    <div
      className="animate-slide-up"
      role="region"
      aria-label="Histórico de testes"
    >
      {/* ---- Cabeçalho: título + botão de limpar tudo ---- */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-sf-text">
            Histórico de Testes
          </h2>
          <p className="text-sm text-sf-textSecondary mt-1">
            {history.length} teste{history.length !== 1 ? "s" : ""} salvo
            {history.length !== 1 ? "s" : ""}
          </p>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            disabled={clearingAll}
            aria-label={
              confirmClear
                ? "Confirmar limpeza do histórico"
                : "Limpar todo o histórico"
            }
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-sf-primary/50 disabled:opacity-50 disabled:cursor-not-allowed ${
              confirmClear
                ? "bg-sf-danger text-white"
                : "bg-sf-surface border border-sf-border text-sf-textSecondary hover:bg-sf-surfaceHover"
            }`}
          >
            {clearingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash className="w-4 h-4" aria-hidden="true" />
            )}
            {clearingAll
              ? "Limpando..."
              : confirmClear
                ? "Confirmar Limpeza"
                : "Limpar Tudo"}
          </button>
        )}
      </header>

      {/* ---- Barra de busca + controles de filtro e ordenacao ---- */}
      {history.length > 0 && (
        <div className="space-y-3 mb-5">
          {/* Campo de busca */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sf-textMuted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por URL ou método (GET, POST...)"
              aria-label="Buscar testes no histórico"
              className="w-full pl-10 pr-10 py-2.5 bg-sf-surface border border-sf-border rounded-lg text-sf-text placeholder:text-sf-textMuted focus:outline-none focus:ring-2 focus:ring-sf-primary/30 text-sm transition-all"
            />
            {/* Botão para limpar busca */}
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Limpar busca"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-sf-textMuted hover:text-sf-text transition-colors focus:outline-none focus:ring-2 focus:ring-sf-primary/50"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Controles: filtro por status + ordenacao */}
          <div className="flex items-center gap-2">
            {/* Dropdown de filtro por status */}
            <div className="relative" ref={filterMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setShowFilterMenu(!showFilterMenu);
                  setShowSortMenu(false);
                }}
                aria-label="Filtrar por status"
                aria-expanded={showFilterMenu ? "true" : "false"}
                aria-haspopup="listbox"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-sf-primary/50 ${
                  statusFilter !== "all"
                    ? "bg-sf-primary/10 border-sf-primary/30 text-sf-primary"
                    : "bg-sf-surface border-sf-border text-sf-textSecondary hover:bg-sf-surfaceHover"
                }`}
              >
                <Filter className="w-3.5 h-3.5" aria-hidden="true" />
                {STATUS_FILTER_LABELS[statusFilter]}
              </button>

              {showFilterMenu && (
                <div
                  role="listbox"
                  aria-label="Opções de filtro por status"
                  className="absolute top-full left-0 mt-1 bg-sf-surface border border-sf-border rounded-lg shadow-lg py-1 z-20 min-w-[150px]"
                >
                  {(Object.keys(STATUS_FILTER_LABELS) as StatusFilter[]).map(
                    (key) => (
                      <button
                        type="button"
                        key={key}
                        role="option"
                        aria-selected={statusFilter === key ? "true" : "false"}
                        onClick={() => {
                          setStatusFilter(key);
                          setShowFilterMenu(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors focus:outline-none focus:bg-sf-surfaceHover ${
                          statusFilter === key
                            ? "text-sf-primary bg-sf-primary/5"
                            : "text-sf-textSecondary hover:bg-sf-surfaceHover hover:text-sf-text"
                        }`}
                      >
                        {STATUS_FILTER_LABELS[key]}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>

            {/* Dropdown de ordenacao */}
            <div className="relative" ref={sortMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setShowSortMenu(!showSortMenu);
                  setShowFilterMenu(false);
                }}
                aria-label="Ordenar resultados"
                aria-expanded={showSortMenu ? "true" : "false"}
                aria-haspopup="listbox"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-sf-surface border border-sf-border text-sf-textSecondary hover:bg-sf-surfaceHover transition-all focus:outline-none focus:ring-2 focus:ring-sf-primary/50"
              >
                <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                {SORT_LABELS[sortBy]}
              </button>

              {showSortMenu && (
                <div
                  role="listbox"
                  aria-label="Opções de ordenação"
                  className="absolute top-full left-0 mt-1 bg-sf-surface border border-sf-border rounded-lg shadow-lg py-1 z-20 min-w-[170px]"
                >
                  {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
                    <button
                      type="button"
                      key={key}
                      role="option"
                      aria-selected={sortBy === key ? "true" : "false"}
                      onClick={() => {
                        setSortBy(key);
                        setShowSortMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors focus:outline-none focus:bg-sf-surfaceHover ${
                        sortBy === key
                          ? "text-sf-primary bg-sf-primary/5"
                          : "text-sf-textSecondary hover:bg-sf-surfaceHover hover:text-sf-text"
                      }`}
                    >
                      {SORT_LABELS[key]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Botão para limpar filtros quando ha filtros ativos */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                aria-label="Limpar todos os filtros"
                className="flex items-center gap-1 px-2 py-1.5 text-xs text-sf-textMuted hover:text-sf-text transition-colors focus:outline-none focus:ring-2 focus:ring-sf-primary/50 rounded"
              >
                <X className="w-3 h-3" aria-hidden="true" />
                Limpar filtros
              </button>
            )}

            {/* Contador de resultados filtrados */}
            {hasActiveFilters && (
              <span
                className="ml-auto text-xs text-sf-textMuted"
                aria-live="polite"
              >
                {processedResults.length} de {history.length} teste
                {history.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ---- Estado vazio: nenhum teste no histórico ---- */}
      {history.length === 0 && (
        <EmptyState
          icon={
            <Calendar
              className="w-12 h-12 text-sf-textMuted"
              aria-hidden="true"
            />
          }
          title="Nenhum teste realizado"
          description="Os resultados dos testes aparecerão aqui automaticamente."
        />
      )}

      {/* ---- Lista de resultados ---- */}
      {processedResults.length > 0 && (
        <div aria-label="Lista de testes realizados">
          {dateGroups ? (
            /* Exibicao agrupada por período (quando ordenado por data) */
            dateGroups.map((group) => (
              <div key={group.label} className="mb-4">
                <h3 className="text-xs font-semibold text-sf-textMuted uppercase tracking-wider mb-2 px-1">
                  {group.label}
                </h3>
                <div
                  className="space-y-2"
                  role="list"
                  aria-label={`Testes: ${group.label}`}
                >
                  {group.items.map((result) => (
                    <HistoryItem
                      key={result.id}
                      result={result}
                      isConfirmingDelete={deletingId === result.id}
                      isBusyDeleting={busyDeleteId === result.id}
                      onView={handleView}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            /* Exibicao linear (quando ordenado por métrica) */
            <div
              className="space-y-2"
              role="list"
              aria-label="Lista de testes realizados"
            >
              {processedResults.map((result) => (
                <HistoryItem
                  key={result.id}
                  result={result}
                  isConfirmingDelete={deletingId === result.id}
                  isBusyDeleting={busyDeleteId === result.id}
                  onView={handleView}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- Busca sem resultados ---- */}
      {processedResults.length === 0 && history.length > 0 && (
        <EmptyState
          icon={
            <Search
              className="w-10 h-10 text-sf-textMuted"
              aria-hidden="true"
            />
          }
          title="Nenhum resultado encontrado"
          description={
            search
              ? `Nenhum teste corresponde a "${search}"${statusFilter !== "all" ? ` com status "${STATUS_FILTER_LABELS[statusFilter]}"` : ""}.`
              : `Nenhum teste com status "${STATUS_FILTER_LABELS[statusFilter]}".`
          }
          action={
            <button
              type="button"
              onClick={handleClearFilters}
              className="mt-3 text-sm text-sf-primary hover:text-sf-primaryHover transition-colors focus:outline-none focus:ring-2 focus:ring-sf-primary/50 rounded px-2 py-1"
            >
              Limpar filtros
            </button>
          }
        />
      )}
    </div>
  );
}

/* =========================================================================
   Subcomponente -- Item individual do histórico
   Exibe resumo do teste com ações de visualizar e excluir.
   ========================================================================= */

interface HistoryItemProps {
  result: TestResult;
  isConfirmingDelete: boolean;
  isBusyDeleting: boolean;
  onView: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

// Otimizacao: React.memo para HistoryItem evita re-renders desnecessarios da lista.
// Em historicos com dezenas de testes, cada interação (busca, filtro, confirmação de
// exclusão) causaria re-render de TODOS os itens. Com memo, apenas itens cujas props
// realmente mudaram (ex: isConfirmingDelete) são re-renderizados.
// Para listas muito grandes (100+ itens), considerar virtualizacao com react-window.
const HistoryItem = memo(function HistoryItem({
  result,
  isConfirmingDelete,
  isBusyDeleting,
  onView,
  onDelete,
}: HistoryItemProps) {
  const healthScore = getQuickScore(result);

  /** Rótulo descritivo do status para leitores de tela */
  const statusLabel =
    result.status === "completed"
      ? "Concluído"
      : result.status === "cancelled"
        ? "Cancelado"
        : "Erro";

  return (
    <div
      role="listitem"
      aria-label={`Teste em ${result.url}, ${statusLabel}, nota de saúde ${healthScore}`}
      className="bg-sf-surface border border-sf-border rounded-xl p-4 hover:border-sf-textMuted transition-all group focus-within:ring-2 focus-within:ring-sf-primary/30"
    >
      <div className="flex items-center justify-between gap-3">
        {/* ---- Informações do teste ---- */}
        <div className="flex-1 min-w-0">
          {/* Linha principal: indicador de saude + URL + badges de status */}
          <div className="flex items-center gap-2">
            {/* Indicador colorido de saude (bolinha) */}
            <div
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${getScoreColor(healthScore)}`}
              title={`${getScoreLabel(healthScore)} (${healthScore}/100)`}
              aria-hidden="true"
            />
            {/* Texto somente para leitores de tela */}
            <span className="sr-only">{getScoreLabel(healthScore)}</span>

            {/* URL do teste */}
            <span
              className="font-medium text-sf-text truncate"
              title={result.url}
            >
              {result.url}
            </span>

            {/* Badge: método HTTP */}
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-sf-bg border border-sf-border text-sf-textMuted rounded font-mono">
              {result.config.method}
            </span>

            {/* Badge: status se não foi concluido normalmente */}
            {result.status === "cancelled" && (
              <span className="shrink-0 text-xs px-1.5 py-0.5 bg-sf-warning/10 text-sf-warning rounded">
                Cancelado
              </span>
            )}
            {result.status === "error" && (
              <span className="shrink-0 text-xs px-1.5 py-0.5 bg-sf-danger/10 text-sf-danger rounded">
                Erro
              </span>
            )}
          </div>

          {/* Linha de metadados: data, duração, RPS, usuários, erros */}
          <div className="flex items-center gap-4 mt-2 text-xs text-sf-textMuted flex-wrap">
            {/* Data e hora do teste */}
            <span className="flex items-center gap-1" title="Data do teste">
              <Calendar className="w-3 h-3" aria-hidden="true" />
              {format(new Date(result.startTime), "dd/MM/yyyy 'às' HH:mm", {
                locale: ptBR,
              })}
            </span>

            {/* Duração em segundos */}
            <span className="flex items-center gap-1" title="Duração do teste">
              <Clock className="w-3 h-3" aria-hidden="true" />
              {result.durationSeconds}s
            </span>

            {/* Requests por segundo */}
            <span
              className="flex items-center gap-1"
              title="Requisições por segundo"
            >
              <Activity className="w-3 h-3" aria-hidden="true" />
              {result.rps} RPS
            </span>

            {/* Número de usuários virtuais */}
            <span
              className="flex items-center gap-1"
              title="Usuários virtuais simultâneos"
            >
              <Users className="w-3 h-3" aria-hidden="true" />
              {result.config.virtualUsers} usuários
            </span>

            {/* Taxa de erros (destacada em vermelho se acima de 5%) */}
            <span
              className={`flex items-center gap-1 ${result.errorRate > 5 ? "text-sf-danger" : ""}`}
              title="Taxa de erro"
            >
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              {result.errorRate}% erros
            </span>
          </div>
        </div>

        {/* ---- Botões de ação (ver detalhes / excluir) ---- */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {/* Botão: ver detalhes do teste */}
          <button
            type="button"
            onClick={() => onView(result)}
            aria-label={`Ver detalhes do teste em ${result.url}`}
            className="p-2 rounded-lg hover:bg-sf-surfaceHover text-sf-textSecondary hover:text-sf-text transition-all focus:outline-none focus:ring-2 focus:ring-sf-primary/50 focus:opacity-100"
          >
            <Eye className="w-4 h-4" aria-hidden="true" />
          </button>

          {/* Botão: excluir teste (com confirmação inline) */}
          <button
            type="button"
            onClick={() => onDelete(result.id)}
            disabled={isBusyDeleting}
            aria-label={
              isBusyDeleting
                ? `Excluindo teste em ${result.url}`
                : isConfirmingDelete
                  ? `Confirmar exclusão do teste em ${result.url}`
                  : `Excluir teste em ${result.url}`
            }
            className={`p-2 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-sf-primary/50 focus:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed ${
              isConfirmingDelete
                ? "bg-sf-danger/10 text-sf-danger"
                : "hover:bg-sf-danger/10 text-sf-textSecondary hover:text-sf-danger"
            }`}
          >
            {isBusyDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

/* =========================================================================
   Subcomponente -- Estado vazio reutilizavel
   Exibido quando não ha testes ou quando a busca não retorna resultados.
   ========================================================================= */

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-16" role="status">
      <div className="mx-auto mb-4">{icon}</div>
      <h3 className="text-lg font-medium text-sf-text mb-2">{title}</h3>
      <p className="text-sm text-sf-textSecondary max-w-sm mx-auto">
        {description}
      </p>
      {action}
    </div>
  );
}
