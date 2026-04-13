/**
 * Layout.tsx — Estrutura principal da aplicação CPX-Stress
 *
 * Este componente define o "esqueleto" visual do aplicativo:
 *   - Cabeçalho (header) com logotipo, nome e versão
 *   - Area de conteúdo principal onde as páginas são renderizadas
 *
 * Todas as páginas do app são exibidas dentro deste layout.
 */

import type { ReactNode } from "react";
import compexLogo from "@/assets/compex-logo.gif";

/* -------------------------------------------------------------------------- */
/*  Constantes — informações exibidas no cabeçalho                            */
/* -------------------------------------------------------------------------- */

/** Versão atual exibida como badge no cabeçalho */
const APP_VERSION = "v1.0";

/* -------------------------------------------------------------------------- */
/*  Componente de tipagem — propriedades aceitas pelo Layout                  */
/* -------------------------------------------------------------------------- */

interface LayoutProps {
  /** Conteúdo filho que sera renderizado na area principal */
  children: ReactNode;
}

/* -------------------------------------------------------------------------- */
/*  Componente Layout                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Layout raiz do aplicativo.
 *
 * Responsabilidades:
 *  1. Renderizar o cabeçalho fixo no topo com identidade visual
 *  2. Prover uma area flexivel que ocupa o restante da tela para o conteúdo
 *
 * Acessibilidade:
 *  - O cabeçalho usa a tag semantica <header> com role="banner"
 *  - A area de conteúdo e envolvida por uma <div> sem role semântico,
 *    pois o <main> real fica dentro de App.tsx
 *  - Cores seguem o design system "sf-*" definido no Tailwind
 */
export function Layout({ children }: LayoutProps) {
  return (
    <div
      className="h-screen flex flex-col bg-sf-shellBg text-sf-text"
      lang="pt-BR"
    >
      {/* ------------------------------------------------------------------ */}
      {/*  Link de pular navegação — acessibilidade para teclado             */}
      {/* ------------------------------------------------------------------ */}
      <a
        href="#main-content"
        className="
          sr-only focus:not-sr-only
          focus:absolute focus:z-50 focus:top-2 focus:left-2
          focus:px-4 focus:py-2 focus:bg-sf-primary focus:text-white
          focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-white
        "
      >
        Pular para o conteúdo principal
      </a>

      {/* ------------------------------------------------------------------ */}
      {/*  Cabeçalho — barra superior fixa com logo e informações do app     */}
      {/* ------------------------------------------------------------------ */}
      <header
        role="banner"
        aria-label="Cabeçalho do aplicativo CPX-Stress"
        className="
          h-12 shrink-0
          flex items-center justify-between
          px-4
          bg-sf-shellSurface
          border-b border-sf-shellBorder
          select-none
          relative z-10
        "
      >
        {/* Lado esquerdo: logo Compex */}
        <div className="flex items-center gap-2.5">
          <img
            src={compexLogo}
            alt="Compex"
            className="compex-logo-glow h-5 w-auto opacity-90 transition-opacity duration-300 hover:opacity-100"
            style={{ filter: "brightness(0) invert(1)" }}
            draggable={false}
          />
        </div>

        {/* Lado direito: badge de versão */}
        <span
          className="text-xs text-sf-textMuted bg-sf-shellBg border border-sf-shellBorder px-2 py-0.5 rounded-full"
          aria-label={`Versão ${APP_VERSION}`}
        >
          {APP_VERSION}
        </span>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/*  Area de conteúdo — ocupa todo o espaço restante da tela            */}
      {/* ------------------------------------------------------------------ */}
      <div id="main-content" className="flex-1 overflow-hidden relative z-10">
        {children}
      </div>
    </div>
  );
}
