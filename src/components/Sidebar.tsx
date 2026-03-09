import { Zap, History, RotateCcw } from 'lucide-react'
import { useTestStore } from '@/stores/test-store'
import type { AppView } from '@/types'

const navItems: { id: AppView; label: string; icon: typeof Zap }[] = [
  { id: 'test', label: 'Novo Teste', icon: Zap },
  { id: 'history', label: 'Histórico', icon: History },
]

export function Sidebar() {
  const view = useTestStore((s) => s.view)
  const setView = useTestStore((s) => s.setView)
  const status = useTestStore((s) => s.status)
  const setStatus = useTestStore((s) => s.setStatus)
  const clearProgress = useTestStore((s) => s.clearProgress)
  const setCurrentResult = useTestStore((s) => s.setCurrentResult)
  const history = useTestStore((s) => s.history)

  const handleNewTest = () => {
    setView('test')
    if (status !== 'running') {
      setStatus('idle')
      clearProgress()
      setCurrentResult(null)
    }
  }

  return (
    <aside className="w-56 bg-sf-surface border-r border-sf-border flex flex-col shrink-0">
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = view === item.id
          return (
            <button
              key={item.id}
              onClick={() =>
                item.id === 'test' ? handleNewTest() : setView(item.id)
              }
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? 'bg-sf-primary/10 text-sf-primary'
                  : 'text-sf-textSecondary hover:bg-sf-surfaceHover hover:text-sf-text'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
              {item.id === 'history' && history.length > 0 && (
                <span className="ml-auto text-xs bg-sf-bg px-1.5 py-0.5 rounded-full text-sf-textMuted">
                  {history.length}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {status === 'running' && (
        <div className="p-3 border-t border-sf-border">
          <div className="flex items-center gap-2 px-3 py-2 text-sm">
            <div className="w-2 h-2 rounded-full bg-sf-accent animate-pulse-glow" />
            <span className="text-sf-accent text-xs">Teste em execução...</span>
          </div>
        </div>
      )}

      {(status === 'completed' || status === 'cancelled') && (
        <div className="p-3 border-t border-sf-border">
          <button
            onClick={handleNewTest}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sf-textSecondary hover:bg-sf-surfaceHover hover:text-sf-text transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Novo Teste</span>
          </button>
        </div>
      )}

      <div className="p-3 border-t border-sf-border">
        <div className="text-xs text-sf-textMuted px-3">© 2026 StressFlow</div>
      </div>
    </aside>
  )
}
