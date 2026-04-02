import { useCallback, useRef } from "react";
import { Play, History, RotateCcw } from "lucide-react";
import { useTestStore } from "@/stores/test-store";
import type { AppView } from "@/types";

/* ============================================================
   Sidebar.tsx - Barra lateral de navegação do StressFlow
   ============================================================
   Este componente renderiza o menu lateral da aplicação.
   Ele permite ao usuário:
     - Iniciar um novo teste de estresse
     - Consultar o histórico de testes anteriores
     - Ver o status de um teste em andamento
     - Reiniciar rapidamente após um teste finalizado
   ============================================================ */

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

/** Representa um item do menu de navegação */
interface NavItem {
  /** Identificador único que corresponde a uma tela da aplicação */
  id: AppView;
  /** Texto exibido ao usuário no menu */
  label: string;
  /** Descrição curta para ajudar o usuário a entender o que faz */
  description: string;
  /** Icone exibido ao lado do texto */
  icon: typeof Play;
  /** Rótulo de acessibilidade lido por leitores de tela */
  ariaLabel: string;
}

// ---------------------------------------------------------------------------
// Itens de navegação
// ---------------------------------------------------------------------------

/**
 * Lista dos itens que aparecem no menu lateral.
 * Para adicionar uma nova página, basta incluir um novo objeto aqui.
 */
const NAV_ITEMS: NavItem[] = [
  {
    id: "test",
    label: "Novo Teste",
    description: "Configurar e executar",
    icon: Play,
    ariaLabel: "Ir para a tela de novo teste de estresse",
  },
  {
    id: "history",
    label: "Histórico",
    description: "Testes anteriores",
    icon: History,
    ariaLabel: "Ver histórico de testes realizados",
  },
];

// ---------------------------------------------------------------------------
// Componentes internos
// ---------------------------------------------------------------------------

/**
 * Indicador pulsante exibido enquanto um teste esta em execução.
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
          Teste em execução...
        </span>
      </div>
    </div>
  );
}

/**
 * Botão "Novo Teste" exibido após a conclusão ou cancelamento de um teste.
 * Permite ao usuário reiniciar rapidamente sem precisar navegar pelo menu.
 */
function NewTestShortcut({ onClick }: { onClick: () => void }) {
  return (
    <div className="p-3 border-t border-sf-border">
      <button
        type="button"
        onClick={onClick}
        aria-label="Reiniciar e configurar um novo teste"
        className={
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm " +
          "text-sf-textSecondary hover:bg-sf-surfaceHover hover:text-sf-text " +
          "transition-colors focus-visible:outline-none focus-visible:ring-2 " +
          "focus-visible:ring-sf-primary focus-visible:ring-offset-1"
        }
      >
        <RotateCcw className="w-4 h-4" aria-hidden="true" />
        <span>Novo Teste</span>
      </button>
    </div>
  );
}

/**
 * Contador (badge) que aparece ao lado do item "Histórico" quando
 * existem testes salvos. Mostra ao usuário quantos registros ha.
 */
function HistoryBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <span
      className={
        "ml-auto text-xs bg-sf-bg px-1.5 py-0.5 rounded-full " +
        "text-sf-textMuted tabular-nums"
      }
      aria-label={`${count} ${count === 1 ? "teste salvo" : "testes salvos"}`}
    >
      {count}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function Sidebar() {
  // --- Estado global da aplicação (Zustand) ---
  const view = useTestStore((s) => s.view);
  const setView = useTestStore((s) => s.setView);
  const status = useTestStore((s) => s.status);
  const setStatus = useTestStore((s) => s.setStatus);
  const clearProgress = useTestStore((s) => s.clearProgress);
  const setCurrentResult = useTestStore((s) => s.setCurrentResult);
  const history = useTestStore((s) => s.history);

  // --- Acoes de navegação ---

  /**
   * Navega para a tela de novo teste.
   * Se não houver um teste rodando, limpa os dados anteriores
   * para que o formulario apareca vazio e pronto para uso.
   */
  const handleNewTest = useCallback(() => {
    setView("test");

    // So reseta o formulario se nenhum teste estiver em andamento
    if (status !== "running") {
      setStatus("idle");
      clearProgress();
      setCurrentResult(null);
    }
  }, [status, setView, setStatus, clearProgress, setCurrentResult]);

  /**
   * Trata o clique em qualquer item de navegação.
   * O item "test" tem logica especial (limpar estado),
   * os demais apenas trocam a tela.
   */
  const handleNavClick = useCallback(
    (itemId: AppView) => {
      if (itemId === "test") {
        handleNewTest();
      } else {
        setView(itemId);
      }
    },
    [handleNewTest, setView],
  );

  // --- Flags de exibicao condicional ---
  const isTestRunning = status === "running";
  const isTestFinished = status === "completed" || status === "cancelled";

  // --- Referência para navegação por teclado (setas) no menu ---
  const navRef = useRef<HTMLElement>(null);

  /**
   * Permite navegar entre os itens do menu usando as setas do teclado
   * (ArrowUp / ArrowDown) e ativa-los com Enter ou Space.
   */
  const handleNavKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const buttons = navRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-nav-item]",
      );
      if (!buttons || buttons.length === 0) return;

      const currentIndex = Array.from(buttons).findIndex(
        (btn) => btn === document.activeElement,
      );

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = (currentIndex + 1) % buttons.length;
        buttons[next].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = (currentIndex - 1 + buttons.length) % buttons.length;
        buttons[prev].focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        buttons[0].focus();
      } else if (e.key === "End") {
        e.preventDefault();
        buttons[buttons.length - 1].focus();
      }
    },
    [],
  );

  // --- Renderização ---
  return (
    <aside
      className="w-56 bg-sf-surface/70 backdrop-blur-sm border-r border-sf-border flex flex-col shrink-0 relative z-10"
      aria-label="Menu lateral de navegação"
    >
      {/* ---- Menu de navegação principal ---- */}
      <nav
        ref={navRef}
        className="flex-1 p-3 space-y-1"
        aria-label="Navegação principal"
        onKeyDown={handleNavKeyDown}
        role="navigation"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = view === item.id;

          return (
            <button
              type="button"
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              aria-label={item.ariaLabel}
              aria-current={isActive ? "page" : undefined}
              data-nav-item
              className={
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm " +
                "transition-colors focus-visible:outline-none focus-visible:ring-2 " +
                "focus-visible:ring-sf-primary focus-visible:ring-offset-1 " +
                (isActive
                  ? "bg-sf-primary/10 text-sf-primary font-medium"
                  : "text-sf-textSecondary hover:bg-sf-surfaceHover hover:text-sf-text")
              }
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />

              {/* Texto e descrição do item */}
              <span className="flex flex-col items-start leading-tight">
                <span>{item.label}</span>
                {/* Descrição curta visível apenas quando o item esta ativo */}
                {isActive && (
                  <span className="text-[10px] opacity-70 font-normal">
                    {item.description}
                  </span>
                )}
              </span>

              {/* Badge com contagem de testes no histórico */}
              {item.id === "history" && <HistoryBadge count={history.length} />}
            </button>
          );
        })}
      </nav>

      {/* ---- Indicador de teste em andamento ---- */}
      {isTestRunning && <RunningIndicator />}

      {/* ---- Atalho para novo teste (após conclusão) ---- */}
      {isTestFinished && <NewTestShortcut onClick={handleNewTest} />}

      {/* ---- Rodape com logo Compex e copyright ---- */}
      <footer
        className="p-3 border-t border-sf-border"
        role="contentinfo"
        aria-label="Informações de direitos autorais"
      >
        <div className="flex flex-col items-center gap-1 px-3">
          <span className="text-[10px] text-sf-textMuted/50">
            &copy; 2026 CPX - MisterT Stress
          </span>
          <span className="text-[9px] text-sf-textMuted/30">
            Compex Tecnologia
          </span>
        </div>
      </footer>
    </aside>
  );
}
