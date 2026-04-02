import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  XCircle,
} from "lucide-react";
import type { ErrorRecord } from "@/types";

const PAGE_SIZE = 20;

/** Traduz tipo de erro para texto legível */
function errorTypeLabel(type: string): string {
  const map: Record<string, string> = {
    http: "HTTP",
    timeout: "Timeout",
    connection: "Conexão",
    dns: "DNS",
    unknown: "Desconhecido",
  };
  return map[type] || type;
}

/** Traduz status code em texto descritivo */
function statusCodeLabel(code: number): string {
  if (code === 0) return "Sem resposta";
  if (code === 400) return "400 Bad Request";
  if (code === 401) return "401 Não Autorizado";
  if (code === 403) return "403 Proibido";
  if (code === 404) return "404 Não Encontrado";
  if (code === 429) return "429 Rate Limited";
  if (code === 500) return "500 Erro Interno";
  if (code === 502) return "502 Bad Gateway";
  if (code === 503) return "503 Indisponivel";
  return String(code);
}

/** Cor de fundo baseada no tipo de erro */
function errorTypeColor(type: string): string {
  const map: Record<string, string> = {
    http: "text-sf-warning",
    timeout: "text-sf-danger",
    connection: "text-sf-danger",
    dns: "text-orange-400",
    unknown: "text-sf-textMuted",
  };
  return map[type] || "text-sf-textMuted";
}

interface ErrorExplorerProps {
  testId: string;
}

export function ErrorExplorer({ testId }: ErrorExplorerProps) {
  const [records, setRecords] = useState<ErrorRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [filterStatusCode, setFilterStatusCode] = useState<number | undefined>(
    undefined,
  );
  const [filterErrorType, setFilterErrorType] = useState<string | undefined>(
    undefined,
  );

  // Resumos agregados
  const [byStatusCode, setByStatusCode] = useState<Record<string, number>>({});
  const [byErrorType, setByErrorType] = useState<Record<string, number>>({});

  // Carregar resumos ao montar
  useEffect(() => {
    const load = async () => {
      try {
        const [sc, et] = await Promise.all([
          window.stressflow.errors.byStatusCode(testId),
          window.stressflow.errors.byErrorType(testId),
        ]);
        setByStatusCode(sc);
        setByErrorType(et);
      } catch {
        // Silenciar — dados opcionais
      }
    };
    load();
  }, [testId]);

  // Carregar registros com filtros e paginação
  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.stressflow.errors.search({
        testId,
        statusCode: filterStatusCode,
        errorType: filterErrorType,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setRecords(result.records as ErrorRecord[]);
      setTotal(result.total);
    } catch {
      setRecords([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [testId, filterStatusCode, filterErrorType, page]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // Reset página ao mudar filtros
  useEffect(() => {
    setPage(0);
  }, [filterStatusCode, filterErrorType]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasErrors =
    Object.keys(byStatusCode).length > 0 || Object.keys(byErrorType).length > 0;

  if (!hasErrors && !loading) {
    return (
      <div className="text-center py-8 text-sf-textMuted text-sm">
        Nenhum erro detalhado registrado para este teste.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumo por tipo e por status code */}
      <div className="grid grid-cols-2 gap-3">
        {/* Por tipo de erro */}
        {Object.keys(byErrorType).length > 0 && (
          <div className="p-3 bg-sf-surface border border-sf-border rounded-xl">
            <h4 className="text-xs font-medium text-sf-textSecondary mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Por Tipo de Erro
            </h4>
            <div className="space-y-1">
              {Object.entries(byErrorType).map(([type, count]) => (
                <button
                  key={type}
                  onClick={() =>
                    setFilterErrorType(
                      filterErrorType === type ? undefined : type,
                    )
                  }
                  className={`w-full flex justify-between items-center text-xs px-2 py-1 rounded transition-all ${
                    filterErrorType === type
                      ? "bg-sf-primary/20 text-sf-primary"
                      : "hover:bg-sf-bg text-sf-textSecondary"
                  }`}
                >
                  <span className={errorTypeColor(type)}>
                    {errorTypeLabel(type)}
                  </span>
                  <span className="font-mono">
                    {count.toLocaleString("pt-BR")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Por status code */}
        {Object.keys(byStatusCode).length > 0 && (
          <div className="p-3 bg-sf-surface border border-sf-border rounded-xl">
            <h4 className="text-xs font-medium text-sf-textSecondary mb-2 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              Por Status HTTP
            </h4>
            <div className="space-y-1">
              {Object.entries(byStatusCode).map(([code, count]) => (
                <button
                  key={code}
                  onClick={() => {
                    const n = Number(code);
                    setFilterStatusCode(filterStatusCode === n ? undefined : n);
                  }}
                  className={`w-full flex justify-between items-center text-xs px-2 py-1 rounded transition-all ${
                    filterStatusCode === Number(code)
                      ? "bg-sf-primary/20 text-sf-primary"
                      : "hover:bg-sf-bg text-sf-textSecondary"
                  }`}
                >
                  <span>{statusCodeLabel(Number(code))}</span>
                  <span className="font-mono">
                    {count.toLocaleString("pt-BR")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filtros ativos */}
      {(filterStatusCode || filterErrorType) && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-sf-textMuted">Filtros ativos:</span>
          {filterStatusCode && (
            <button
              onClick={() => setFilterStatusCode(undefined)}
              className="flex items-center gap-1 px-2 py-0.5 bg-sf-primary/10 text-sf-primary rounded-full"
            >
              Status: {filterStatusCode}
              <XCircle className="w-3 h-3" />
            </button>
          )}
          {filterErrorType && (
            <button
              onClick={() => setFilterErrorType(undefined)}
              className="flex items-center gap-1 px-2 py-0.5 bg-sf-primary/10 text-sf-primary rounded-full"
            >
              Tipo: {errorTypeLabel(filterErrorType)}
              <XCircle className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Tabela de erros */}
      <div className="border border-sf-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sf-surface text-sf-textSecondary text-xs">
                <th className="text-left px-3 py-2 font-medium">Horario</th>
                <th className="text-left px-3 py-2 font-medium">Operação</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Tipo</th>
                <th className="text-left px-3 py-2 font-medium">Mensagem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sf-border">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-6 text-sf-textMuted"
                  >
                    <Search className="w-4 h-4 animate-spin inline-block mr-2" />
                    Carregando...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-6 text-sf-textMuted"
                  >
                    Nenhum erro encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                records.map((err) => (
                  <tr
                    key={err.id}
                    className="hover:bg-sf-surface/50 transition-colors"
                  >
                    <td className="px-3 py-2 text-xs text-sf-textMuted font-mono whitespace-nowrap">
                      {new Date(err.timestamp).toLocaleTimeString("pt-BR")}
                    </td>
                    <td className="px-3 py-2 text-xs text-sf-textSecondary">
                      {err.operationName}
                    </td>
                    <td className="text-center px-3 py-2">
                      <span
                        className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                          err.statusCode >= 500
                            ? "bg-sf-danger/10 text-sf-danger"
                            : err.statusCode >= 400
                              ? "bg-sf-warning/10 text-sf-warning"
                              : "bg-sf-textMuted/10 text-sf-textMuted"
                        }`}
                      >
                        {err.statusCode || "—"}
                      </span>
                    </td>
                    <td
                      className={`px-3 py-2 text-xs ${errorTypeColor(err.errorType)}`}
                    >
                      {errorTypeLabel(err.errorType)}
                    </td>
                    <td
                      className="px-3 py-2 text-xs text-sf-text max-w-xs truncate"
                      title={err.message}
                    >
                      {err.message}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 bg-sf-surface border-t border-sf-border text-xs text-sf-textMuted">
            <span>
              {total.toLocaleString("pt-BR")} erro{total !== 1 ? "s" : ""} —
              Página {page + 1} de {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="p-1 hover:text-sf-text disabled:opacity-30 transition-colors"
                aria-label="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 hover:text-sf-text disabled:opacity-30 transition-colors"
                aria-label="Proxima página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
