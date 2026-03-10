/**
 * Configuracao do Tailwind CSS — StressFlow
 * ===========================================
 * Este arquivo define o design system completo da aplicacao.
 *
 * Estrutura:
 *   1. Paleta de cores (prefixo "sf-") ........... tokens de cor do tema escuro
 *   2. Tipografia ................................. familias, tamanhos e espacamentos
 *   3. Espacamento e dimensionamento .............. medidas customizadas reutilizaveis
 *   4. Sombras .................................... brilhos coloridos para tema escuro
 *   5. Desfoque de fundo .......................... backdrop-blur extra-pequeno
 *   6. Animacoes e keyframes ...................... transicoes suaves da interface
 *   7. Funcoes de timing e duracoes ............... curvas de aceleracao personalizadas
 *   8. Breakpoints responsivos .................... pontos de quebra para Electron/web
 *   9. Plugin de utilitarios customizados ......... classes prontas para padroes comuns
 *
 * Convencao de nomenclatura:
 *   - Todas as cores usam o prefixo "sf-" (StressFlow)
 *   - Sombras luminosas usam o prefixo "glow-"
 *   - Animacoes descrevem o movimento (slide-up, fade-in, etc.)
 *
 * @type {import('tailwindcss').Config}
 */

import plugin from 'tailwindcss/plugin'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    /* ====================================================================
       BREAKPOINTS RESPONSIVOS
       ====================================================================
       Pontos de quebra pensados para a janela do Electron e para uso web.
       Inclui breakpoints menores (xs) para sidebars e paineis compactos,
       e breakpoints maiores (3xl) para monitores ultrawide.
       ==================================================================== */
    screens: {
      xs: '480px',      // Paineis estreitos, sidebar expandida
      sm: '640px',      // Celulares em paisagem / janelas pequenas
      md: '768px',      // Tablets / janela media do Electron
      lg: '1024px',     // Desktops / janela padrao do Electron
      xl: '1280px',     // Monitores grandes
      '2xl': '1536px',  // Monitores full HD+
      '3xl': '1920px',  // Ultrawide / monitores 4K
    },

    extend: {
      /* ----------------------------------------------------------------
         1. PALETA DE CORES — design system "sf-*"
         ----------------------------------------------------------------
         Todas as cores da aplicacao sao centralizadas aqui para garantir
         consistencia visual. O prefixo "sf-" (StressFlow) evita conflitos
         com as classes padrao do Tailwind.

         Organizacao:
           - Fundos (bg, bgSubtle) .... superficies de base da aplicacao
           - Superficies (surface) ..... cards, paineis e areas elevadas
           - Bordas (border) ........... divisores e contornos
           - Semanticas ................ primary, accent, success, warning, danger, info
           - Texto ..................... hierarquia de leitura (principal -> apagado)
           - Utilitarias ............... overlay, highlight, focus ring
      ---------------------------------------------------------------- */
      colors: {
        sf: {
          /* -- Fundos da aplicacao -- */
          bg:           '#0f1117',   // Fundo principal (mais escuro)
          bgSubtle:     '#131520',   // Fundo com leve variacao (areas secundarias)

          /* -- Superficies elevadas (cards, modais, paineis) -- */
          surface:       '#1a1d27',  // Superficie padrao
          surfaceHover:  '#252833',  // Superficie ao passar o mouse
          surfaceActive: '#2e3140',  // Superficie ao clicar / selecionado

          /* -- Bordas e divisores -- */
          border:       '#2a2d3a',   // Borda padrao
          borderSubtle: '#22252f',   // Borda discreta (separadores leves)
          borderStrong: '#3a3d4a',   // Borda com mais destaque

          /* -- Cor primaria (indigo) — acoes principais e foco -- */
          primary:       '#6366f1',  // Botoes, links, elementos interativos
          primaryHover:  '#818cf8',  // Estado hover da cor primaria
          primaryMuted:  '#4f46e5',  // Variante mais escura / menos destaque
          primaryFaint:  '#3730a3',  // Para fundos sutis com tom primario

          /* -- Cor de destaque (ciano) — metricas e status ativo -- */
          accent:       '#22d3ee',   // Indicadores ativos, dados em destaque
          accentMuted:  '#06b6d4',   // Variante menos vibrante
          accentFaint:  '#0e7490',   // Fundo sutil com tom de destaque

          /* -- Cores semanticas: sucesso (verde) -- */
          success:       '#22c55e',  // Resultados positivos, testes aprovados
          successMuted:  '#16a34a',  // Variante menos vibrante
          successFaint:  '#166534',  // Fundo sutil de sucesso

          /* -- Cores semanticas: alerta (amarelo/ambar) -- */
          warning:       '#f59e0b',  // Avisos, degradacao de performance
          warningMuted:  '#d97706',  // Variante menos vibrante
          warningFaint:  '#92400e',  // Fundo sutil de alerta

          /* -- Cores semanticas: perigo (vermelho) -- */
          danger:       '#ef4444',   // Erros, falhas criticas
          dangerMuted:  '#dc2626',   // Variante menos vibrante
          dangerFaint:  '#991b1b',   // Fundo sutil de perigo

          /* -- Cores semanticas: informacao (azul) -- */
          info:          '#3b82f6',  // Dicas, tooltips, informacoes neutras
          infoMuted:     '#2563eb',  // Variante menos vibrante
          infoFaint:     '#1e40af',  // Fundo sutil informativo

          /* -- Hierarquia de texto — do mais legivel ao mais apagado -- */
          text:          '#e2e8f0',  // Texto principal (titulos, conteudo)
          textSecondary: '#94a3b8',  // Texto secundario (descricoes, labels)
          textMuted:     '#64748b',  // Texto discreto (placeholders, dicas)
          textFaint:     '#475569',  // Texto muito apagado (desabilitado)

          /* -- Utilitarias -- */
          overlay:    'rgba(0, 0, 0, 0.6)',    // Sobreposicao para modais e dialogs
          highlight:  'rgba(99, 102, 241, 0.08)', // Destaque sutil de linha/celula
          focusRing:  'rgba(99, 102, 241, 0.5)',  // Anel de foco para acessibilidade
        },
      },

      /* ----------------------------------------------------------------
         2. TIPOGRAFIA
         ----------------------------------------------------------------
         Fontes escolhidas para clareza e profissionalismo:
         - Inter: fonte sans-serif moderna, excelente para interfaces
         - JetBrains Mono: fonte monospacada para dados tecnicos e codigo

         Inclui tamanho extra-pequeno (2xs) para badges e indicadores,
         e estilos display para titulos grandes e impactantes.
      ---------------------------------------------------------------- */
      fontFamily: {
        sans:    ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
        display: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        '2xs':     ['0.625rem',  { lineHeight: '0.875rem' }],  // 10px — badges, etiquetas
        'display': ['2.25rem',   { lineHeight: '2.5rem', fontWeight: '700', letterSpacing: '-0.02em' }],
        'hero':    ['3rem',      { lineHeight: '3.25rem', fontWeight: '800', letterSpacing: '-0.03em' }],
      },
      letterSpacing: {
        tightest: '-0.04em',  // Para titulos grandes e impactantes
      },

      /* ----------------------------------------------------------------
         3. ESPACAMENTO E DIMENSIONAMENTO
         ----------------------------------------------------------------
         Medidas adicionais que complementam a escala padrao do Tailwind.
         Usadas para ajustes finos de layout onde os valores padrao nao
         oferecem a granularidade necessaria.
      ---------------------------------------------------------------- */
      borderRadius: {
        '2xl': '1rem',    // Cards e paineis grandes
        '3xl': '1.25rem', // Modais e containers destacados
        '4xl': '1.5rem',  // Elementos hero e secoes principais
      },
      spacing: {
        4.5: '1.125rem',  // 18px — gap intermediario
        13:  '3.25rem',   // 52px — altura de botoes grandes
        15:  '3.75rem',   // 60px — espacamento entre secoes
        18:  '4.5rem',    // 72px — margem de secao
        88:  '22rem',     // 352px — largura da sidebar
        120: '30rem',     // 480px — largura maxima de modais
      },
      maxWidth: {
        '8xl': '88rem',   // Container extra-largo para dashboards
        '9xl': '96rem',   // Layout ultrawide
      },
      minHeight: {
        'screen-safe': 'calc(100vh - 4rem)', // Altura segura descontando header
      },

      /* ----------------------------------------------------------------
         4. SOMBRAS — compatíveis com tema escuro (brilhos coloridos)
         ----------------------------------------------------------------
         Em temas escuros, sombras tradicionais nao funcionam bem.
         Usamos "glows" (brilhos) coloridos para dar sensacao de elevacao
         e destaque aos elementos interativos.

         Nomenclatura:
           glow-*     = brilho colorido (primario, accent, success, etc.)
           card*      = sombras sutis para cards
           elevated   = sombra forte para elementos flutuantes
           inner-glow = brilho interno sutil (efeito glass)
      ---------------------------------------------------------------- */
      boxShadow: {
        /* Brilhos com a cor primaria (indigo) */
        'glow-sm':      '0 0 8px -2px rgba(99, 102, 241, 0.25)',
        'glow':         '0 0 16px -4px rgba(99, 102, 241, 0.3)',
        'glow-lg':      '0 0 24px -6px rgba(99, 102, 241, 0.35)',

        /* Brilhos com cores semanticas */
        'glow-accent':  '0 0 16px -4px rgba(34, 211, 238, 0.3)',
        'glow-success': '0 0 16px -4px rgba(34, 197, 94, 0.3)',
        'glow-danger':  '0 0 16px -4px rgba(239, 68, 68, 0.3)',
        'glow-warning': '0 0 16px -4px rgba(245, 158, 11, 0.3)',
        'glow-info':    '0 0 16px -4px rgba(59, 130, 246, 0.3)',

        /* Sombras de cards e elevacao */
        'card':         '0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.3)',
        'card-hover':   '0 4px 12px -2px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3)',
        'elevated':     '0 8px 24px -8px rgba(0, 0, 0, 0.5), 0 4px 8px -4px rgba(0, 0, 0, 0.3)',

        /* Efeitos internos (glassmorphism) */
        'inner-glow':   'inset 0 1px 0 0 rgba(255, 255, 255, 0.03)',
        'inner-light':  'inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
      },

      /* ----------------------------------------------------------------
         5. DESFOQUE DE FUNDO
         ----------------------------------------------------------------
         Usado com backdrop-blur para efeitos de vidro fosco (glass).
         O tamanho "xs" cria um desfoque muito sutil.
      ---------------------------------------------------------------- */
      backdropBlur: {
        xs: '2px',  // Desfoque minimo — usado em overlays leves
      },

      /* ----------------------------------------------------------------
         6. ANIMACOES E KEYFRAMES
         ----------------------------------------------------------------
         Animacoes CSS pré-definidas para transicoes suaves na interface.
         Todas usam a curva "out-expo" para movimentos naturais e rapidos.

         Categorias:
           - Entrada de elementos (slide, fade, scale, bounce)
           - Efeitos continuos (pulse, shimmer, progress)
           - Feedback visual (border-glow, shake)
           - Tooltip (tooltip-enter)
      ---------------------------------------------------------------- */
      animation: {
        /* Efeitos continuos — ficam rodando em loop */
        'pulse-glow':      'pulse-glow 2s ease-in-out infinite',
        'shimmer':         'shimmer 2s linear infinite',
        'spin-slow':       'spin 3s linear infinite',
        'progress-bar':    'progress-bar 1.5s ease-in-out infinite',
        'border-glow':     'border-glow 2s ease-in-out infinite',

        /* Entrada de elementos — executam uma vez ao aparecer */
        'slide-up':        'slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down':      'slide-down 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right':  'slide-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-left':   'slide-in-left 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in':         'fade-in 0.3s ease-out',
        'fade-in-up':      'fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in-down':    'fade-in-down 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in':        'scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'bounce-in':       'bounce-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',

        /* Tooltip — animacao de aparicao com escala */
        'tooltip-enter':   'tooltip-enter 0.15s ease-out',

        /* Feedback — para chamar atencao do usuario */
        'shake':           'shake 0.5s ease-in-out',

        /* Toast — entrada e saida de notificacoes toast */
        'toast-enter':     'toast-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        'toast-exit':      'toast-exit 0.3s cubic-bezier(0.65, 0, 0.35, 1) both',

        /* Contagem / numeros subindo */
        'count-up':        'count-up 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        /* Pulsar com brilho — usado em indicadores de status ativo */
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },

        /* Deslizar para cima — entrada padrao de cards e notificacoes */
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },

        /* Deslizar para baixo — menus dropdown e paineis que abrem */
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },

        /* Deslizar da direita — paineis laterais e notificacoes toast */
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },

        /* Deslizar da esquerda — sidebar e navegacao */
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-12px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },

        /* Surgir suavemente — transicao generica de opacidade */
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },

        /* Surgir de baixo com fade — entrada elegante de conteudo */
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },

        /* Surgir de cima com fade — alternativa para elementos superiores */
        'fade-in-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },

        /* Escalar para dentro — aparicao de modais e popovers */
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },

        /* Entrar com efeito de "quique" — para elementos que chamam atencao */
        'bounce-in': {
          '0%':   { opacity: '0', transform: 'scale(0.3)' },
          '50%':  { opacity: '1', transform: 'scale(1.05)' },
          '70%':  { transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },

        /* Brilho deslizante — efeito skeleton/loading */
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },

        /* Barra de progresso animada — fundo em movimento */
        'progress-bar': {
          '0%':   { backgroundPosition: '0% 50%' },
          '50%':  { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },

        /* Borda pulsante — destaque de foco ou atencao */
        'border-glow': {
          '0%, 100%': { borderColor: 'rgba(99, 102, 241, 0.3)' },
          '50%':      { borderColor: 'rgba(99, 102, 241, 0.6)' },
        },

        /* Tooltip aparecendo — escala + opacidade suave */
        'tooltip-enter': {
          from: { opacity: '0', transform: 'translateX(var(--tw-translate-x, -50%)) scale(0.95)' },
          to:   { opacity: '1', transform: 'translateX(var(--tw-translate-x, -50%)) scale(1)' },
        },

        /* Tremer — feedback de erro ou validacao */
        'shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
        },

        /* Contagem subindo — numeros que crescem de baixo */
        'count-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },

        /* Toast entrada — desliza da direita com fade */
        'toast-enter': {
          from: { opacity: '0', transform: 'translateX(100%)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },

        /* Toast saida — desliza para a direita com fade */
        'toast-exit': {
          from: { opacity: '1', transform: 'translateX(0)' },
          to:   { opacity: '0', transform: 'translateX(100%)' },
        },
      },

      /* ----------------------------------------------------------------
         7. FUNCOES DE TIMING E DURACOES DE TRANSICAO
         ----------------------------------------------------------------
         Curvas de aceleracao e duracoes para transicoes CSS consistentes.

         "out-expo" cria movimentos que comecam rapido e desaceleram
         suavemente — ideal para interfaces responsivas.
      ---------------------------------------------------------------- */
      transitionTimingFunction: {
        'out-expo':     'cubic-bezier(0.16, 1, 0.3, 1)',    // Saida exponencial — padrao do SF
        'in-out-cubic': 'cubic-bezier(0.65, 0, 0.35, 1)',   // Entrada e saida cubica
        'spring':       'cubic-bezier(0.34, 1.56, 0.64, 1)', // Efeito mola (overshoot leve)
      },
      transitionDuration: {
        250: '250ms', // Transicao rapida (hover de botoes)
        350: '350ms', // Transicao media (abertura de paineis)
        400: '400ms', // Transicao suave (modais e overlays)
      },
    },
  },

  /* ====================================================================
     9. PLUGINS — utilitarios customizados para padroes comuns
     ====================================================================
     Classes utilitarias criadas via plugin para evitar repeticao de
     estilos que aparecem frequentemente nos componentes do StressFlow.

     Classes disponiveis:
       .sf-glass .............. efeito vidro fosco (glassmorphism)
       .sf-card ............... estilo padrao de card elevado
       .sf-card-interactive ... card com hover e transicao
       .sf-text-gradient ...... texto com gradiente primario
       .sf-focus-ring ......... anel de foco acessivel
       .sf-scrollbar-thin ..... scrollbar customizada fina
       .sf-truncate-2 ........ truncar texto em 2 linhas
       .sf-truncate-3 ........ truncar texto em 3 linhas
  ==================================================================== */
  plugins: [
    plugin(function ({ addUtilities }) {
      addUtilities({
        /* -- Efeito vidro fosco (glassmorphism) --
           Cria uma superficie translucida com desfoque de fundo.
           Uso: <div class="sf-glass"> */
        '.sf-glass': {
          backgroundColor: 'rgba(26, 29, 39, 0.7)',
          backdropFilter: 'blur(12px)',
          '-webkit-backdrop-filter': 'blur(12px)',
          border: '1px solid rgba(42, 45, 58, 0.5)',
        },

        /* -- Card padrao do StressFlow --
           Superficie elevada com borda sutil e brilho interno.
           Uso: <div class="sf-card"> */
        '.sf-card': {
          backgroundColor: '#1a1d27',
          borderRadius: '0.75rem',
          border: '1px solid #2a2d3a',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.03)',
        },

        /* -- Card interativo com hover --
           Extende o card padrao com transicoes de hover.
           Uso: <div class="sf-card-interactive"> */
        '.sf-card-interactive': {
          backgroundColor: '#1a1d27',
          borderRadius: '0.75rem',
          border: '1px solid #2a2d3a',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.03)',
          transition: 'all 250ms cubic-bezier(0.16, 1, 0.3, 1)',
          '&:hover': {
            backgroundColor: '#252833',
            borderColor: '#3a3d4a',
            boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3)',
            transform: 'translateY(-1px)',
          },
        },

        /* -- Texto com gradiente --
           Aplica um gradiente primario->accent ao texto.
           Uso: <h1 class="sf-text-gradient"> */
        '.sf-text-gradient': {
          backgroundImage: 'linear-gradient(135deg, #6366f1, #22d3ee)',
          '-webkit-background-clip': 'text',
          'background-clip': 'text',
          '-webkit-text-fill-color': 'transparent',
        },

        /* -- Anel de foco acessivel --
           Anel de foco visivel para navegacao por teclado.
           Uso: <button class="sf-focus-ring"> */
        '.sf-focus-ring': {
          '&:focus-visible': {
            outline: '2px solid rgba(99, 102, 241, 0.5)',
            outlineOffset: '2px',
          },
        },

        /* -- Scrollbar fina customizada --
           Aplica a scrollbar estilizada do design system.
           Uso: <div class="sf-scrollbar-thin overflow-y-auto"> */
        '.sf-scrollbar-thin': {
          '&::-webkit-scrollbar': {
            width: '6px',
            height: '6px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#2a2d3a',
            borderRadius: '3px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: '#3a3d4a',
          },
        },

        /* -- Truncar texto em 2 linhas --
           Corta o texto com reticencias apos 2 linhas.
           Uso: <p class="sf-truncate-2"> */
        '.sf-truncate-2': {
          display: '-webkit-box',
          '-webkit-line-clamp': '2',
          '-webkit-box-orient': 'vertical',
          overflow: 'hidden',
        },

        /* -- Truncar texto em 3 linhas --
           Corta o texto com reticencias apos 3 linhas.
           Uso: <p class="sf-truncate-3"> */
        '.sf-truncate-3': {
          display: '-webkit-box',
          '-webkit-line-clamp': '3',
          '-webkit-box-orient': 'vertical',
          overflow: 'hidden',
        },

        /* -- Gradiente de fundo primario --
           Fundo com gradiente sutil usando a cor primaria.
           Uso: <section class="sf-bg-gradient"> */
        '.sf-bg-gradient': {
          backgroundImage: 'linear-gradient(180deg, rgba(99, 102, 241, 0.05) 0%, transparent 50%)',
        },

        /* -- Separador horizontal com gradiente --
           Linha divisoria que desvanece nas extremidades.
           Uso: <hr class="sf-divider"> */
        '.sf-divider': {
          height: '1px',
          border: 'none',
          backgroundImage: 'linear-gradient(90deg, transparent, #2a2d3a, transparent)',
        },
      })
    }),
  ],
}
