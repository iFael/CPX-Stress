import { useState } from 'react'
import {
  Trash2,
  Eye,
  Search,
  Calendar,
  Clock,
  Activity,
  Trash,
} from 'lucide-react'
import { useTestStore } from '@/stores/test-store'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { TestResult } from '@/types'

export function HistoryPanel() {
  const history = useTestStore((s) => s.history)
  const setHistory = useTestStore((s) => s.setHistory)
  const setCurrentResult = useTestStore((s) => s.setCurrentResult)
  const setView = useTestStore((s) => s.setView)
  const setStatus = useTestStore((s) => s.setStatus)

  const [search, setSearch] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const filtered = history.filter((t) =>
    t.url.toLowerCase().includes(search.toLowerCase())
  )

  const handleView = (result: TestResult) => {
    setCurrentResult(result)
    setStatus('completed')
    setView('results')
  }

  const handleDelete = async (id: string) => {
    await window.stressflow.history.delete(id)
    setHistory(history.filter((t) => t.id !== id))
  }

  const handleClearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    await window.stressflow.history.clear()
    setHistory([])
    setConfirmClear(false)
  }

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-sf-text">
            Histórico de Testes
          </h2>
          <p className="text-sm text-sf-textSecondary mt-1">
            {history.length} teste{history.length !== 1 ? 's' : ''} salvo
            {history.length !== 1 ? 's' : ''}
          </p>
        </div>
        {history.length > 0 && (
          <button
            onClick={handleClearAll}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all ${
              confirmClear
                ? 'bg-sf-danger text-white'
                : 'bg-sf-surface border border-sf-border text-sf-textSecondary hover:bg-sf-surfaceHover'
            }`}
          >
            <Trash className="w-4 h-4" />
            {confirmClear ? 'Confirmar Limpeza' : 'Limpar Tudo'}
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sf-textMuted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por URL..."
            className="w-full pl-10 pr-4 py-2.5 bg-sf-surface border border-sf-border rounded-lg text-sf-text placeholder:text-sf-textMuted focus:outline-none focus:ring-2 focus:ring-sf-primary/30 text-sm transition-all"
          />
        </div>
      )}

      {history.length === 0 && (
        <div className="text-center py-20">
          <Calendar className="w-12 h-12 text-sf-textMuted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-sf-text mb-2">
            Nenhum teste realizado
          </h3>
          <p className="text-sm text-sf-textSecondary">
            Os resultados dos testes aparecerão aqui automaticamente.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((result) => {
          const healthScore = getQuickScore(result)
          return (
            <div
              key={result.id}
              className="bg-sf-surface border border-sf-border rounded-xl p-4 hover:border-sf-textMuted transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        healthScore >= 80
                          ? 'bg-sf-success'
                          : healthScore >= 40
                            ? 'bg-sf-warning'
                            : 'bg-sf-danger'
                      }`}
                    />
                    <span className="font-medium text-sf-text truncate">
                      {result.url}
                    </span>
                    {result.status === 'cancelled' && (
                      <span className="text-xs px-1.5 py-0.5 bg-sf-warning/10 text-sf-warning rounded">
                        Cancelado
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-sf-textMuted">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(
                        new Date(result.startTime),
                        "dd/MM/yyyy 'às' HH:mm",
                        { locale: ptBR }
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {result.durationSeconds}s
                    </span>
                    <span className="flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      {result.rps} RPS
                    </span>
                    <span>{result.config.virtualUsers} usuários</span>
                    <span
                      className={
                        result.errorRate > 5 ? 'text-sf-danger' : ''
                      }
                    >
                      {result.errorRate}% erros
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleView(result)}
                    className="p-2 rounded-lg hover:bg-sf-surfaceHover text-sf-textSecondary hover:text-sf-text transition-all"
                    title="Ver detalhes"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(result.id)}
                    className="p-2 rounded-lg hover:bg-sf-danger/10 text-sf-textSecondary hover:text-sf-danger transition-all"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && history.length > 0 && (
        <div className="text-center py-10">
          <p className="text-sm text-sf-textSecondary">
            Nenhum resultado encontrado para &quot;{search}&quot;
          </p>
        </div>
      )}
    </div>
  )
}

function getQuickScore(result: TestResult): number {
  let score = 100
  if (result.errorRate > 50) score -= 40
  else if (result.errorRate > 5) score -= 20
  if (result.latency.p95 > 5000) score -= 20
  else if (result.latency.p95 > 2000) score -= 10
  return Math.max(0, score)
}
