import { useState, useEffect, useCallback } from "react";
import {
  Globe,
  Users,
  Activity,
  FileDown,
  X,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import compexLogo from "@/assets/compex-logo.gif";

/* ==========================================================================
   WelcomeOverlay — Tela de boas-vindas para novos usuários

   Exibe um overlay/modal elegante na primeira vez que o usuário abre o
   CPX-Stress. Apresenta o proposito da ferramenta e dicas rapidas de uso.

   Comportamento:
   - Verifica a flag "hasSeenWelcome" no localStorage.
   - Se a flag NÃO existir, exibe o overlay com animação de entrada.
   - O usuário pode fechar clicando em "Comecar" ou no botão X.
   - Se marcar "Não mostrar novamente", a flag e salva no localStorage
     e o overlay não aparecera nas proximas sessões.
   - Se NÃO marcar, o overlay aparecera novamente na proxima abertura.

   Este componente e 100% autonomo — basta importa-lo e renderiza-lo.
   Nenhuma alteração e necessaria em App.tsx ou em qualquer outro arquivo.
   ========================================================================== */

/** Chave usada no localStorage para persistir a escolha do usuário */
const STORAGE_KEY = "hasSeenWelcome";

/** Dicas de uso exibidas no overlay */
const TIPS = [
  {
    icon: Globe,
    text: "Selecione o ambiente MisterT (Produção, Homologação, etc.)",
    color: "text-sf-primary",
    bgColor: "bg-sf-primary/10",
    borderColor: "border-sf-primary/20",
  },
  {
    icon: Users,
    text: "Defina a quantidade de usuários virtuais simultâneos",
    color: "text-sf-accent",
    bgColor: "bg-sf-accent/10",
    borderColor: "border-sf-accent/20",
  },
  {
    icon: Activity,
    text: "Acompanhe latência, throughput e erros em tempo real",
    color: "text-sf-success",
    bgColor: "bg-sf-success/10",
    borderColor: "border-sf-success/20",
  },
  {
    icon: FileDown,
    text: "Exporte o laudo completo em PDF ou JSON",
    color: "text-sf-warning",
    bgColor: "bg-sf-warning/10",
    borderColor: "border-sf-warning/20",
  },
] as const;

/* -------------------------------------------------------------------------- */
/*  Componente principal                                                       */
/* -------------------------------------------------------------------------- */

export function WelcomeOverlay() {
  /** Controla se o overlay esta visível */
  const [isVisible, setIsVisible] = useState(false);

  /** Controla a animação de saída antes de desmontar */
  const [isClosing, setIsClosing] = useState(false);

  /** Estado do checkbox "Não mostrar novamente" */
  const [dontShowAgain, setDontShowAgain] = useState(true);

  /* ── Verificação inicial ────────────────────────────────────────────────── */
  useEffect(() => {
    try {
      const alreadySeen = localStorage.getItem(STORAGE_KEY);
      if (alreadySeen !== "true") {
        setIsVisible(true);
      }
    } catch {
      // Se o localStorage não estiver disponível, não exibe o overlay.
      // Isso pode acontecer em modos de navegação privada restritos.
    }
  }, []);

  /* ── Fechar overlay ─────────────────────────────────────────────────────── */
  const handleClose = useCallback(() => {
    // Inicia animação de saída
    setIsClosing(true);

    // Salva preferencia se o checkbox estiver marcado
    if (dontShowAgain) {
      try {
        localStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // Falha silenciosa — o overlay simplesmente aparecera de novo
      }
    }

    // Aguarda a animação de saída terminar antes de desmontar
    setTimeout(() => {
      setIsVisible(false);
    }, 300);
  }, [dontShowAgain]);

  /* ── Fechar com tecla Escape ────────────────────────────────────────────── */
  useEffect(() => {
    if (!isVisible || isClosing) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isVisible, isClosing, handleClose]);

  /* ── Não renderiza nada se não for necessário ───────────────────────────── */
  if (!isVisible) return null;

  /* ── Renderização ───────────────────────────────────────────────────────── */
  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 ${
        isClosing ? "animate-overlay-fade-out" : "animate-overlay-fade-in"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      aria-describedby="welcome-description"
    >
      {/* ---- Backdrop escurecido ---- */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* ---- Modal ---- */}
      <div
        className={`relative w-full max-w-lg rounded-2xl border border-sf-border bg-sf-bg shadow-elevated overflow-hidden ${
          isClosing ? "animate-modal-scale-out" : "animate-modal-scale-in"
        }`}
      >
        {/* Detalhe decorativo — gradiente sutil no topo */}
        <div
          className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sf-primary via-sf-accent to-sf-primary bg-[length:200%_100%] animate-shimmer"
          aria-hidden="true"
        />

        {/* Botão de fechar (X) no canto superior direito */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-sf-textMuted hover:text-sf-text hover:bg-sf-surface transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary/50"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Conteúdo interno com padding */}
        <div className="px-8 pt-10 pb-8">
          {/* ---- Cabeçalho com icone e título ---- */}
          <div className="text-center mb-8">
            {/* Logo Compex com glow */}
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-sf-primary/20 to-sf-accent/10 border border-sf-primary/20 mb-5 shadow-glow">
              <img
                src={compexLogo}
                alt="Compex"
                className="w-12 h-auto"
                style={{ filter: "brightness(0) invert(1)" }}
                draggable={false}
              />
            </div>

            <h2
              id="welcome-title"
              className="text-2xl font-bold text-sf-text mb-3"
            >
              Bem-vindo ao{" "}
              <span className="bg-gradient-to-r from-sf-primary to-sf-accent bg-clip-text text-transparent">
                CPX-Stress
              </span>
            </h2>

            <p
              id="welcome-description"
              className="text-sf-textSecondary leading-relaxed max-w-sm mx-auto"
            >
              Teste de estresse para o MisterT ERP. Simule usuários
              simultâneos executando o fluxo real de operações e análise
              latência, throughput e taxa de erros em tempo real.
            </p>
          </div>

          {/* ---- Dicas de uso ---- */}
          <div className="space-y-3 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-sf-accent" aria-hidden="true" />
              <span className="text-sm font-medium text-sf-textSecondary">
                Como funciona
              </span>
            </div>

            {TIPS.map((tip, index) => {
              const Icon = tip.icon;
              return (
                <div
                  key={index}
                  className={`flex items-center gap-4 p-3.5 rounded-xl border ${tip.borderColor} ${tip.bgColor}/50 transition-all duration-200 hover:scale-[1.01]`}
                  /* Estilo inline necessário: animationDelay e calculado
                     dinamicamente com base no índice do item para criar
                     efeito de entrada escalonada (stagger). */
                  style={{
                    animationDelay: `${150 + index * 100}ms`,
                    animationFillMode: "both",
                  }}
                >
                  {/* Número da etapa + icone */}
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-xl ${tip.bgColor} shrink-0`}
                  >
                    <Icon
                      className={`w-5 h-5 ${tip.color}`}
                      aria-hidden="true"
                    />
                  </div>

                  {/* Texto da dica */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-2xs font-bold text-sf-textMuted uppercase tracking-wider">
                        Passo {index + 1}
                      </span>
                    </div>
                    <p className="text-sm text-sf-text mt-0.5">{tip.text}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ---- Checkbox "Não mostrar novamente" ---- */}
          <label className="flex items-center gap-2.5 mb-5 cursor-pointer group select-none">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="peer sr-only"
              />
              {/* Caixa visual do checkbox */}
              <div className="w-[18px] h-[18px] rounded-md border border-sf-border bg-sf-surface peer-checked:bg-sf-primary peer-checked:border-sf-primary peer-focus-visible:ring-2 peer-focus-visible:ring-sf-primary/50 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-sf-bg transition-all duration-200">
                {/* Checkmark SVG */}
                {dontShowAgain && (
                  <svg
                    className="w-full h-full text-white p-0.5"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2.5 6L5 8.5L9.5 3.5"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-sf-textMuted group-hover:text-sf-textSecondary transition-colors">
              Não mostrar novamente
            </span>
          </label>

          {/* ---- Botão "Comecar" ---- */}
          <button
            type="button"
            onClick={handleClose}
            className="w-full py-3.5 bg-sf-primary hover:bg-sf-primaryHover text-white font-semibold rounded-xl text-base transition-all duration-200 transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2.5 shadow-lg shadow-sf-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-sf-bg"
          >
            Comecar
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>

    </div>
  );
}
