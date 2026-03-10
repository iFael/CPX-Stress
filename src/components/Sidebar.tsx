import { useCallback, useRef } from 'react'
import { Zap, History, RotateCcw } from 'lucide-react'
import { useTestStore } from '@/stores/test-store'
import type { AppView } from '@/types'

/* ============================================================
   Sidebar.tsx - Barra lateral de navegacao do StressFlow
   ============================================================
   Este componente renderiza o menu lateral da aplicacao.
   Ele permite ao usuario:
     - Iniciar um novo teste de estresse
     - Consultar o historico de testes anteriores
     - Ver o status de um teste em andamento
     - Reiniciar rapidamente apos um teste finalizado
   ============================================================ */

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

/** Representa um item do menu de navegacao */
interface NavItem {
  /** Identificador unico que corresponde a uma tela da aplicacao */
  id: AppView
  /** Texto exibido ao usuario no menu */
  label: string
  /** Descricao curta para ajudar o usuario a entender o que faz */
  description: string
  /** Icone exibido ao lado do texto */
  icon: typeof Zap
  /** Rotulo de acessibilidade lido por leitores de tela */
  ariaLabel: string
}

// ---------------------------------------------------------------------------
// Itens de navegacao
// ---------------------------------------------------------------------------

/**
 * Lista dos itens que aparecem no menu lateral.
 * Para adicionar uma nova pagina, basta incluir um novo objeto aqui.
 */
const NAV_ITEMS: NavItem[] = [
  {
    id: 'test',
    label: 'Novo Teste',
    description: 'Configurar e executar',
    icon: Zap,
    ariaLabel: 'Ir para a tela de novo teste de estresse',
  },
  {
    id: 'history',
    label: 'Historico',
    description: 'Testes anteriores',
    icon: History,
    ariaLabel: 'Ver historico de testes realizados',
  },
]

// ---------------------------------------------------------------------------
// Componentes internos
// ---------------------------------------------------------------------------

/**
 * Indicador pulsante exibido enquanto um teste esta em execucao.
 * Informa visualmente que o sistema esta trabalhando.
 */
function RunningIndicator() {
  return (
    <div className="p-3 border-t border-sf-border" role="status">
      <div className="flex items-center gap-2.5 px-3 py-2 text-sm">
        {/* Bolinha verde pulsante - sinal visual de "em andamento" */}
        <div
          className="w-2 h-2 rounded-full bg-sf-accent animate-pulse-glow"
          aria-hidden="true"
        />
        <span className="text-sf-accent text-xs font-medium">
          Teste em execucao...
        </span>
      </div>
    </div>
  )
}

/**
 * Botao "Novo Teste" exibido apos a conclusao ou cancelamento de um teste.
 * Permite ao usuario reiniciar rapidamente sem precisar navegar pelo menu.
 */
function NewTestShortcut({ onClick }: { onClick: () => void }) {
  return (
    <div className="p-3 border-t border-sf-border">
      <button
        type="button"
        onClick={onClick}
        aria-label="Reiniciar e configurar um novo teste"
        className={
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ' +
          'text-sf-textSecondary hover:bg-sf-surfaceHover hover:text-sf-text ' +
          'transition-colors focus-visible:outline-none focus-visible:ring-2 ' +
          'focus-visible:ring-sf-primary focus-visible:ring-offset-1'
        }
      >
        <RotateCcw className="w-4 h-4" aria-hidden="true" />
        <span>Novo Teste</span>
      </button>
    </div>
  )
}

/**
 * Contador (badge) que aparece ao lado do item "Historico" quando
 * existem testes salvos. Mostra ao usuario quantos registros ha.
 */
function HistoryBadge({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <span
      className={
        'ml-auto text-xs bg-sf-bg px-1.5 py-0.5 rounded-full ' +
        'text-sf-textMuted tabular-nums'
      }
      aria-label={`${count} ${count === 1 ? 'teste salvo' : 'testes salvos'}`}
    >
      {count}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function Sidebar() {
  // --- Estado global da aplicacao (Zustand) ---
  const view = useTestStore((s) => s.view)
  const setView = useTestStore((s) => s.setView)
  const status = useTestStore((s) => s.status)
  const setStatus = useTestStore((s) => s.setStatus)
  const clearProgress = useTestStore((s) => s.clearProgress)
  const setCurrentResult = useTestStore((s) => s.setCurrentResult)
  const history = useTestStore((s) => s.history)

  // --- Acoes de navegacao ---

  /**
   * Navega para a tela de novo teste.
   * Se nao houver um teste rodando, limpa os dados anteriores
   * para que o formulario apareca vazio e pronto para uso.
   */
  const handleNewTest = useCallback(() => {
    setView('test')

    // So reseta o formulario se nenhum teste estiver em andamento
    if (status !== 'running') {
      setStatus('idle')
      clearProgress()
      setCurrentResult(null)
    }
  }, [status, setView, setStatus, clearProgress, setCurrentResult])

  /**
   * Trata o clique em qualquer item de navegacao.
   * O item "test" tem logica especial (limpar estado),
   * os demais apenas trocam a tela.
   */
  const handleNavClick = useCallback(
    (itemId: AppView) => {
      if (itemId === 'test') {
        handleNewTest()
      } else {
        setView(itemId)
      }
    },
    [handleNewTest, setView],
  )

  // --- Flags de exibicao condicional ---
  const isTestRunning = status === 'running'
  const isTestFinished = status === 'completed' || status === 'cancelled'

  // --- Referencia para navegacao por teclado (setas) no menu ---
  const navRef = useRef<HTMLElement>(null)

  /**
   * Permite navegar entre os itens do menu usando as setas do teclado
   * (ArrowUp / ArrowDown) e ativa-los com Enter ou Space.
   */
  const handleNavKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const buttons = navRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[data-nav-item]'
      )
      if (!buttons || buttons.length === 0) return

      const currentIndex = Array.from(buttons).findIndex(
        (btn) => btn === document.activeElement
      )

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = (currentIndex + 1) % buttons.length
        buttons[next].focus()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = (currentIndex - 1 + buttons.length) % buttons.length
        buttons[prev].focus()
      } else if (e.key === 'Home') {
        e.preventDefault()
        buttons[0].focus()
      } else if (e.key === 'End') {
        e.preventDefault()
        buttons[buttons.length - 1].focus()
      }
    },
    [],
  )

  // --- Renderizacao ---
  return (
    <aside
      className="w-56 bg-sf-surface border-r border-sf-border flex flex-col shrink-0"
      aria-label="Menu lateral de navegacao"
    >
      {/* ---- Menu de navegacao principal ---- */}
      <nav
        ref={navRef}
        className="flex-1 p-3 space-y-1"
        aria-label="Navegacao principal"
        onKeyDown={handleNavKeyDown}
        role="navigation"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = view === item.id

          return (
            <button
              type="button"
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              aria-label={item.ariaLabel}
              aria-current={isActive ? 'page' : undefined}
              data-nav-item
              className={
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ' +
                'transition-colors focus-visible:outline-none focus-visible:ring-2 ' +
                'focus-visible:ring-sf-primary focus-visible:ring-offset-1 ' +
                (isActive
                  ? 'bg-sf-primary/10 text-sf-primary font-medium'
                  : 'text-sf-textSecondary hover:bg-sf-surfaceHover hover:text-sf-text')
              }
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />

              {/* Texto e descricao do item */}
              <span className="flex flex-col items-start leading-tight">
                <span>{item.label}</span>
                {/* Descricao curta visivel apenas quando o item esta ativo */}
                {isActive && (
                  <span className="text-[10px] opacity-70 font-normal">
                    {item.description}
                  </span>
                )}
              </span>

              {/* Badge com contagem de testes no historico */}
              {item.id === 'history' && (
                <HistoryBadge count={history.length} />
              )}
            </button>
          )
        })}
      </nav>

      {/* ---- Indicador de teste em andamento ---- */}
      {isTestRunning && <RunningIndicator />}

      {/* ---- Atalho para novo teste (apos conclusao) ---- */}
      {isTestFinished && <NewTestShortcut onClick={handleNewTest} />}

      {/* ---- Rodape com copyright ---- */}
      <footer
        className="p-3 border-t border-sf-border"
        role="contentinfo"
        aria-label="Informacoes de direitos autorais"
      >
        <div className="text-xs text-sf-textMuted px-3">
          &copy; 2026 StressFlow
        </div>
      </footer>
    </aside>
  )
}
