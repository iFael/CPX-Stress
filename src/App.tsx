/**
 * App.tsx - Componente principal do StressFlow
 *
 * Este arquivo e o ponto de entrada visual da aplicacao.
 * Ele monta a estrutura geral da tela (layout, menu lateral e conteudo principal)
 * e decide qual pagina mostrar com base no estado atual do aplicativo.
 *
 * Fluxo do usuario:
 *   1. O usuario abre o app e ve a tela de configuracao do teste (TestConfig)
 *   2. Ao iniciar um teste, a tela muda para o progresso em tempo real (TestProgress)
 *   3. Quando o teste termina (ou e cancelado), aparecem os resultados (TestResults)
 *   4. O usuario pode navegar pelo historico de testes anteriores (HistoryPanel)
 */

import { useEffect, useState, useCallback, memo } from 'react'
import { Loader2 } from 'lucide-react'
import { useTestStore } from '@/stores/test-store'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Layout } from '@/components/Layout'
import { Sidebar } from '@/components/Sidebar'
import { TestConfig } from '@/components/TestConfig'
import { TestProgress } from '@/components/TestProgress'
import { TestResults } from '@/components/TestResults'
import { HistoryPanel } from '@/components/HistoryPanel'
import { ToastProvider } from '@/components/Toast'
import { WelcomeOverlay } from '@/components/WelcomeOverlay'
import type { AppView, TestStatus } from '@/types'

/* -------------------------------------------------------------------------- */
/*  Componente principal da aplicacao                                         */
/* -------------------------------------------------------------------------- */

export default function App() {
  /*
   * Estado global da aplicacao (gerenciado pelo Zustand).
   * - view:       qual pagina esta sendo exibida (teste, historico ou resultados)
   * - status:     em que etapa o teste esta (parado, rodando, concluido, etc.)
   * - setHistory: funcao para salvar a lista de testes anteriores no estado
   * - setError:   funcao para registrar mensagens de erro
   */
  const view = useTestStore((s) => s.view)
  const status = useTestStore((s) => s.status)
  const setHistory = useTestStore((s) => s.setHistory)
  const setError = useTestStore((s) => s.setError)

  /**
   * Atalhos de teclado globais da aplicacao.
   * Ctrl+Enter: iniciar teste | Escape: cancelar | Ctrl+N: novo teste
   * Ctrl+H: alternar historico | Ctrl+E: exportar resultados
   */
  useKeyboardShortcuts()

  /**
   * Controle de carregamento inicial.
   * Enquanto o historico esta sendo carregado do disco, exibimos
   * um indicador sutil para que o usuario saiba que o app esta pronto.
   */
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)

  /**
   * Carrega o historico de testes salvos quando o aplicativo inicia.
   *
   * Isso permite que o usuario veja testes anteriores mesmo depois
   * de fechar e reabrir o programa. Caso ocorra algum erro na leitura,
   * o historico fica vazio e um aviso e exibido no console.
   */
  const loadHistory = useCallback(async () => {
    try {
      const savedHistory = await window.stressflow.history.list()
      setHistory(savedHistory)
    } catch (err) {
      console.warn('[StressFlow] Nao foi possivel carregar o historico:', err)
      setError('Falha ao carregar historico de testes anteriores.')
    } finally {
      setIsLoadingHistory(false)
    }
  }, [setHistory, setError])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Layout>
          {/* Container principal: menu lateral + area de conteudo */}
          <div className="flex h-full">
            {/* Menu lateral com navegacao (Novo Teste, Historico, etc.) */}
            <Sidebar />

            {/* Area de conteudo principal — muda conforme a pagina ativa */}
            <main className="flex-1 overflow-auto px-4 py-2">
              <MainContent
                view={view}
                status={status}
                isLoading={isLoadingHistory}
              />
            </main>
          </div>
        </Layout>
        <WelcomeOverlay />
      </ToastProvider>
    </ErrorBoundary>
  )
}

/* -------------------------------------------------------------------------- */
/*  Componente que decide qual conteudo mostrar na area principal              */
/* -------------------------------------------------------------------------- */

/**
 * MainContent renderiza a pagina correta com base na navegacao e no
 * estado atual do teste. Essa separacao torna o App.tsx mais limpo
 * e facilita entender o fluxo de telas.
 *
 * Mapa de telas:
 *   - view="test"    + status="idle"                   -> Formulario de configuracao
 *   - view="test"    + status="running"                -> Progresso em tempo real
 *   - view="test"    + status="completed"/"cancelled"  -> Resultados do teste
 *   - view="test"    + status="error"                  -> Formulario (com erro exibido)
 *   - view="history"                                   -> Lista de testes anteriores
 *   - view="results"                                   -> Detalhes de um teste do historico
 */
// Otimizacao: React.memo evita re-renderizacao do MainContent quando props
// (view, status, isLoading) nao mudam. Sem memo, qualquer mudanca no App
// (ex: re-render por contexto) forçaria MainContent a re-renderizar tambem,
// recriando toda a arvore de componentes filhos desnecessariamente.
const MainContent = memo(function MainContent({
  view,
  status,
  isLoading,
}: {
  view: AppView
  status: TestStatus
  isLoading: boolean
}) {
  /* ---- Carregamento inicial: exibe spinner enquanto o historico e carregado ---- */
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 animate-slide-up">
        <Loader2 className="w-8 h-8 text-sf-primary animate-spin" aria-hidden="true" />
        <p className="text-sm text-sf-textSecondary">Carregando dados...</p>
      </div>
    )
  }

  /* ---- Pagina: Historico de testes anteriores ---- */
  if (view === 'history') {
    return <HistoryPanel />
  }

  /* ---- Pagina: Visualizacao detalhada de um resultado do historico ---- */
  if (view === 'results') {
    return <TestResults />
  }

  /* ---- Pagina: Fluxo principal do teste (configurar -> executar -> resultado) ---- */

  /*
   * Quando o teste esta parado ("idle") ou deu erro,
   * mostramos o formulario de configuracao para o usuario
   * poder (re)configurar e iniciar um novo teste.
   */
  if (status === 'idle' || status === 'error') {
    return <TestConfig />
  }

  /*
   * Quando o teste esta em execucao, mostramos a tela de progresso
   * com metricas atualizadas em tempo real (RPS, latencia, erros, etc.).
   */
  if (status === 'running') {
    return <TestProgress />
  }

  /*
   * Quando o teste terminou (concluido ou cancelado pelo usuario),
   * mostramos a tela de resultados com graficos, score de saude
   * e recomendacoes.
   */
  if (status === 'completed' || status === 'cancelled') {
    return <TestResults />
  }

  /*
   * Fallback de seguranca: caso nenhuma condicao acima seja atendida
   * (o que nao deveria acontecer em uso normal), voltamos ao formulario.
   * Isso evita que o usuario veja uma tela em branco.
   */
  return <TestConfig />
})
