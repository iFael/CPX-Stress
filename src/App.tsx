import { useEffect } from 'react'
import { useTestStore } from '@/stores/test-store'
import { Layout } from '@/components/Layout'
import { Sidebar } from '@/components/Sidebar'
import { TestConfig } from '@/components/TestConfig'
import { TestProgress } from '@/components/TestProgress'
import { TestResults } from '@/components/TestResults'
import { HistoryPanel } from '@/components/HistoryPanel'

export default function App() {
  const view = useTestStore((s) => s.view)
  const status = useTestStore((s) => s.status)
  const setHistory = useTestStore((s) => s.setHistory)

  useEffect(() => {
    window.stressflow.history.list().then(setHistory).catch(() => {})
  }, [setHistory])

  return (
    <Layout>
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6">
          {view === 'test' && (
            <>
              {status === 'idle' && <TestConfig />}
              {status === 'running' && <TestProgress />}
              {(status === 'completed' || status === 'cancelled') && <TestResults />}
              {status === 'error' && <TestConfig />}
            </>
          )}
          {view === 'history' && <HistoryPanel />}
          {view === 'results' && <TestResults />}
        </main>
      </div>
    </Layout>
  )
}
