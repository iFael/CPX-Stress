import type { ReactNode } from 'react'
import { Activity } from 'lucide-react'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col bg-sf-bg">
      <header className="h-12 flex items-center justify-between px-4 bg-sf-surface border-b border-sf-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sf-primary flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-sf-text">StressFlow</span>
          <span className="text-xs text-sf-textMuted bg-sf-bg px-2 py-0.5 rounded-full">
            v1.0
          </span>
        </div>
        <div className="text-xs text-sf-textMuted">
          Teste de Estresse Profissional
        </div>
      </header>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
