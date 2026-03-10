/**
 * useKeyboardShortcuts.ts - Atalhos de teclado globais do StressFlow
 *
 * Registra listeners de teclado para acoes comuns da aplicacao.
 * O hook deve ser chamado uma unica vez no componente raiz (App.tsx).
 *
 * Atalhos disponiveis:
 *   Ctrl+Enter  — Iniciar teste (quando na tela de configuracao)
 *   Escape      — Cancelar teste em execucao
 *   Ctrl+N      — Novo teste (voltar a tela de configuracao)
 *   Ctrl+H      — Alternar exibicao do historico
 *   Ctrl+E      — Exportar resultados em PDF (quando na tela de resultados)
 *
 * Eventos customizados disparados:
 *   'stressflow:start-test'     — Ouvido por TestConfig para iniciar o teste
 *   'stressflow:export-results' — Ouvido por TestResults para exportar PDF
 */

import { useEffect, useCallback } from 'react'
import { useTestStore } from '@/stores/test-store'

export function useKeyboardShortcuts() {
  const view = useTestStore((s) => s.view)
  const status = useTestStore((s) => s.status)
  const setView = useTestStore((s) => s.setView)
  const setStatus = useTestStore((s) => s.setStatus)
  const clearProgress = useTestStore((s) => s.clearProgress)
  const setCurrentResult = useTestStore((s) => s.setCurrentResult)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const { key, ctrlKey, metaKey } = event
      const mod = ctrlKey || metaKey

      // Verifica se o foco esta em um campo de texto (input, textarea ou
      // contentEditable). Nesse caso, atalhos de navegacao (Ctrl+N, Ctrl+H,
      // Ctrl+E) devem ser ignorados para nao interferir com a digitacao.
      // Ctrl+Enter (submeter) e Escape (cancelar) continuam funcionando
      // pois sao padroes de UX esperados dentro de formularios.
      const target = event.target as HTMLElement | null
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true

      // --- Ctrl+Enter: Iniciar teste ---
      // Funciona apenas quando o usuario esta na tela de configuracao
      // e o teste nao esta rodando.
      if (mod && key === 'Enter') {
        if (view === 'test' && (status === 'idle' || status === 'error')) {
          event.preventDefault()
          window.dispatchEvent(new CustomEvent('stressflow:start-test'))
        }
        return
      }

      // --- Escape: Cancelar teste em execucao ---
      // Funciona em qualquer tela, desde que haja um teste rodando.
      if (key === 'Escape') {
        if (status === 'running') {
          event.preventDefault()
          window.stressflow.test.cancel()
        }
        return
      }

      // --- Ctrl+N: Novo teste ---
      // Navega para a tela de configuracao e reseta o estado
      // (exceto se houver um teste em andamento).
      // Ignorado quando o usuario esta digitando em um campo de texto.
      if (mod && key.toLowerCase() === 'n') {
        if (isTyping) return
        event.preventDefault()
        setView('test')
        if (status !== 'running') {
          setStatus('idle')
          clearProgress()
          setCurrentResult(null)
        }
        return
      }

      // --- Ctrl+H: Alternar historico ---
      // Se ja esta no historico, volta para a tela de teste.
      // Caso contrario, abre o historico.
      // Ignorado quando o usuario esta digitando em um campo de texto.
      if (mod && key.toLowerCase() === 'h') {
        if (isTyping) return
        event.preventDefault()
        setView(view === 'history' ? 'test' : 'history')
        return
      }

      // --- Ctrl+E: Exportar resultados em PDF ---
      // Funciona apenas quando ha resultados visiveis na tela.
      // Ignorado quando o usuario esta digitando em um campo de texto.
      if (mod && key.toLowerCase() === 'e') {
        if (isTyping) return
        const hasResults =
          view === 'results' ||
          (view === 'test' && (status === 'completed' || status === 'cancelled'))
        if (hasResults) {
          event.preventDefault()
          window.dispatchEvent(new CustomEvent('stressflow:export-results'))
        }
        return
      }
    },
    [view, status, setView, setStatus, clearProgress, setCurrentResult],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
