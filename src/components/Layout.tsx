/**
 * Layout.tsx — Estrutura principal da aplicacao StressFlow
 *
 * Este componente define o "esqueleto" visual do aplicativo:
 *   - Cabecalho (header) com logotipo, nome e versao
 *   - Area de conteudo principal onde as paginas sao renderizadas
 *
 * Todas as paginas do app sao exibidas dentro deste layout.
 */

import type { ReactNode } from 'react'
import { Activity } from 'lucide-react'

/* -------------------------------------------------------------------------- */
/*  Constantes — informacoes exibidas no cabecalho                            */
/* -------------------------------------------------------------------------- */

/** Nome do aplicativo mostrado ao lado do icone */
const APP_NAME = 'StressFlow'

/** Versao atual exibida como badge no cabecalho */
const APP_VERSION = 'v1.0'

/** Subtitulo descritivo exibido no lado direito do cabecalho */
const APP_TAGLINE = 'Teste de Estresse Profissional'

/* -------------------------------------------------------------------------- */
/*  Componente de tipagem — propriedades aceitas pelo Layout                  */
/* -------------------------------------------------------------------------- */

interface LayoutProps {
  /** Conteudo filho que sera renderizado na area principal */
  children: ReactNode
}

/* -------------------------------------------------------------------------- */
/*  Componente Layout                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Layout raiz do aplicativo.
 *
 * Responsabilidades:
 *  1. Renderizar o cabecalho fixo no topo com identidade visual
 *  2. Prover uma area flexivel que ocupa o restante da tela para o conteudo
 *
 * Acessibilidade:
 *  - O cabecalho usa a tag semantica <header> com role="banner"
 *  - A area de conteudo e envolvida por uma <div> sem role semantico,
 *    pois o <main> real fica dentro de App.tsx
 *  - Cores seguem o design system "sf-*" definido no Tailwind
 */
export function Layout({ children }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-sf-bg text-sf-text" lang="pt-BR">
      {/* ------------------------------------------------------------------ */}
      {/*  Link de pular navegacao — acessibilidade para teclado             */}
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
        Pular para o conteudo principal
      </a>

      {/* ------------------------------------------------------------------ */}
      {/*  Cabecalho — barra superior fixa com logo e informacoes do app     */}
      {/* ------------------------------------------------------------------ */}
      <header
        role="banner"
        aria-label="Cabecalho do aplicativo StressFlow"
        className="
          h-12 shrink-0
          flex items-center justify-between
          px-4
          bg-sf-surface
          border-b border-sf-border
          select-none
        "
      >
        {/* Lado esquerdo: icone + nome + badge de versao */}
        <div className="flex items-center gap-2">
          {/* Icone do aplicativo */}
          <div
            className="
              w-8 h-8
              rounded-lg
              bg-sf-primary
              flex items-center justify-center
            "
            aria-hidden="true"
          >
            <Activity className="w-4 h-4 text-white" />
          </div>

          {/* Nome do aplicativo */}
          <span className="text-sm font-semibold text-sf-text">
            {APP_NAME}
          </span>

          {/* Badge com a versao atual */}
          <span
            className="
              text-xs text-sf-textMuted
              bg-sf-bg
              px-2 py-0.5
              rounded-full
            "
            aria-label={`Versao ${APP_VERSION}`}
          >
            {APP_VERSION}
          </span>
        </div>

        {/* Lado direito: subtitulo / descricao curta */}
        <span
          className="hidden sm:block text-xs text-sf-textMuted"
          aria-label="Descricao do aplicativo"
        >
          {APP_TAGLINE}
        </span>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/*  Area de conteudo — ocupa todo o espaco restante da tela            */}
      {/* ------------------------------------------------------------------ */}
      <div
        id="main-content"
        className="flex-1 overflow-hidden"
      >
        {children}
      </div>
    </div>
  )
}
