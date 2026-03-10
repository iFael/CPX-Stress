/**
 * ConfirmDialog.tsx
 *
 * Dialogo de confirmacao reutilizavel para acoes destrutivas ou importantes.
 * Substitui o padrao de "dois cliques" usado em HistoryPanel e pode ser
 * adicionado a qualquer fluxo que precise de confirmacao explicita do usuario.
 *
 * Funcionalidades:
 *  - Tres variantes visuais: danger (vermelho), warning (amarelo), info (indigo)
 *  - Overlay com backdrop-blur sobre o conteudo da pagina
 *  - Animacoes suaves de entrada e saida (fade + scale)
 *  - Suporte completo a teclado (Enter confirma, Escape cancela)
 *  - Focus trap: o foco fica preso dentro do dialogo enquanto ele esta aberto
 *  - Rotulos padrao em portugues ("Confirmar" / "Cancelar")
 *  - Acessibilidade via aria-modal, role="dialog", aria-labelledby, aria-describedby
 *  - Renderizado via React Portal para evitar problemas de z-index
 */

import { useEffect, useRef, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Info, X } from 'lucide-react'

/* =========================================================================
   Tipos
   ========================================================================= */

/** Variantes visuais do dialogo, cada uma com cor e icone distintos */
type ConfirmDialogVariant = 'danger' | 'warning' | 'info'

/**
 * Propriedades aceitas pelo componente ConfirmDialog.
 *
 * - title:        Titulo exibido no cabecalho do dialogo
 * - message:      Texto explicativo sobre a acao que sera confirmada
 * - confirmLabel: Texto do botao de confirmacao (padrao: "Confirmar")
 * - cancelLabel:  Texto do botao de cancelamento (padrao: "Cancelar")
 * - onConfirm:    Callback executado quando o usuario confirma a acao
 * - onCancel:     Callback executado quando o usuario cancela ou fecha o dialogo
 * - variant:      Variante visual — altera cor e icone (padrao: "danger")
 */
export interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: ConfirmDialogVariant
}

/* =========================================================================
   Mapa de estilos por variante
   ========================================================================= */

/**
 * Cada variante define suas cores para o icone, o botao de confirmacao
 * e o anel de destaque (ring) ao redor do container do icone.
 */
interface VariantStyle {
  /** Icone exibido no topo do dialogo */
  icon: typeof AlertTriangle
  /** Cor do icone (classe Tailwind text-*) */
  iconColor: string
  /** Fundo do circulo ao redor do icone */
  iconBg: string
  /** Borda do circulo ao redor do icone */
  iconRing: string
  /** Classes do botao de confirmacao (fundo, hover, foco) */
  confirmButton: string
}

const VARIANT_STYLES: Record<ConfirmDialogVariant, VariantStyle> = {
  danger: {
    icon: AlertTriangle,
    iconColor: 'text-sf-danger',
    iconBg: 'bg-sf-danger/10',
    iconRing: 'ring-sf-danger/20',
    confirmButton:
      'bg-sf-danger hover:bg-sf-dangerMuted focus-visible:ring-sf-danger/50 text-white',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-sf-warning',
    iconBg: 'bg-sf-warning/10',
    iconRing: 'ring-sf-warning/20',
    confirmButton:
      'bg-sf-warning hover:bg-sf-warningMuted focus-visible:ring-sf-warning/50 text-sf-bg',
  },
  info: {
    icon: Info,
    iconColor: 'text-sf-primary',
    iconBg: 'bg-sf-primary/10',
    iconRing: 'ring-sf-primary/20',
    confirmButton:
      'bg-sf-primary hover:bg-sf-primaryMuted focus-visible:ring-sf-primary/50 text-white',
  },
}

/* =========================================================================
   Componente principal — ConfirmDialog
   ========================================================================= */

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  variant = 'danger',
}: ConfirmDialogProps) {
  // IDs unicos para conectar o dialogo aos seus rotulos (acessibilidade)
  const titleId = useId()
  const descriptionId = useId()

  // Referencia ao container do dialogo (para o focus trap)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Referencia ao botao de cancelar (recebe foco inicial — mais seguro)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  // Estilos da variante selecionada
  const styles = VARIANT_STYLES[variant]
  const IconComponent = styles.icon

  /* -----------------------------------------------------------------------
     Efeito: foco inicial no botao de cancelar ao abrir
     O botao de cancelar recebe foco por padrao porque e a acao mais segura;
     isso evita que o usuario confirme acidentalmente ao pressionar Enter.
     ----------------------------------------------------------------------- */
  useEffect(() => {
    // Salva o elemento que tinha foco antes do dialogo abrir
    const previouslyFocused = document.activeElement as HTMLElement | null

    // Move o foco para o botao de cancelar
    cancelButtonRef.current?.focus()

    // Ao fechar, devolve o foco ao elemento original
    return () => {
      previouslyFocused?.focus()
    }
  }, [])

  /* -----------------------------------------------------------------------
     Efeito: bloqueia o scroll do body enquanto o dialogo esta aberto
     ----------------------------------------------------------------------- */
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  /* -----------------------------------------------------------------------
     Focus trap — mantem o foco circulando dentro do dialogo
     Quando o usuario pressiona Tab no ultimo elemento focavel, o foco
     volta para o primeiro, e vice-versa com Shift+Tab.
     ----------------------------------------------------------------------- */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Escape: cancela o dialogo
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }

      // Enter: confirma a acao (exceto se o foco esta no botao de cancelar)
      if (event.key === 'Enter') {
        const active = document.activeElement
        // Se o foco esta no botao de cancelar, Enter aciona o cancelar normalmente
        if (active === cancelButtonRef.current) return
        event.preventDefault()
        onConfirm()
        return
      }

      // Tab / Shift+Tab: focus trap
      if (event.key === 'Tab') {
        const dialog = dialogRef.current
        if (!dialog) return

        // Coleta todos os elementos focaveis dentro do dialogo
        const focusableElements = dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )

        if (focusableElements.length === 0) return

        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        // Shift+Tab no primeiro elemento: vai para o ultimo
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault()
          lastElement.focus()
        }
        // Tab no ultimo elemento: volta para o primeiro
        else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault()
          firstElement.focus()
        }
      }
    },
    [onCancel, onConfirm],
  )

  /* -----------------------------------------------------------------------
     Handler: clique no backdrop (overlay) fecha o dialogo
     Verifica se o clique foi exatamente no overlay e nao no conteudo.
     ----------------------------------------------------------------------- */
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onCancel()
      }
    },
    [onCancel],
  )

  /* -----------------------------------------------------------------------
     Renderizacao — via Portal para sobrepor toda a interface
     ----------------------------------------------------------------------- */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={handleBackdropClick}
      aria-hidden="false"
    >
      {/* ---- Overlay escuro com desfoque ---- */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* ---- Conteudo do dialogo ---- */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-md bg-sf-surface border border-sf-border rounded-2xl shadow-elevated animate-scale-in overflow-hidden"
      >
        {/* Brilho sutil no topo do dialogo (efeito de vidro) */}
        <div
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent"
          aria-hidden="true"
        />

        {/* ---- Botao X para fechar (canto superior direito) ---- */}
        <button
          type="button"
          onClick={onCancel}
          aria-label="Fechar dialogo"
          className="absolute top-3 right-3 p-1.5 rounded-lg text-sf-textMuted hover:text-sf-text hover:bg-sf-surfaceHover transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary/50"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>

        {/* ---- Corpo do dialogo ---- */}
        <div className="px-6 pt-6 pb-5">
          {/* Icone da variante dentro de um circulo colorido */}
          <div className="flex justify-center mb-4">
            <div
              className={`flex items-center justify-center w-12 h-12 rounded-full ring-4 ${styles.iconBg} ${styles.iconRing}`}
            >
              <IconComponent
                className={`w-6 h-6 ${styles.iconColor}`}
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Titulo */}
          <h2
            id={titleId}
            className="text-lg font-semibold text-sf-text text-center"
          >
            {title}
          </h2>

          {/* Mensagem descritiva */}
          <p
            id={descriptionId}
            className="mt-2 text-sm text-sf-textSecondary text-center leading-relaxed"
          >
            {message}
          </p>
        </div>

        {/* ---- Rodape com botoes de acao ---- */}
        <div className="flex items-center gap-3 px-6 pb-6">
          {/* Botao Cancelar (acao segura — recebe foco inicial) */}
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-sf-bg border border-sf-border text-sf-textSecondary hover:text-sf-text hover:bg-sf-surfaceHover transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary/50"
          >
            {cancelLabel}
          </button>

          {/* Botao Confirmar (acao principal — cor depende da variante) */}
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 ${styles.confirmButton}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
