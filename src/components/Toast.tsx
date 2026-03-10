/**
 * Toast.tsx - Sistema de notificacoes (toast) do StressFlow
 *
 * Implementacao leve e sem dependencias externas para exibir
 * notificacoes temporarias ao usuario (sucesso, erro, aviso, info).
 *
 * Uso:
 *   1. Envolva a aplicacao com <ToastProvider>
 *   2. Em qualquer componente filho, use o hook useToast():
 *
 *      const { toast } = useToast()
 *      toast.success('Teste concluido com sucesso!')
 *      toast.error('Falha ao conectar com o servidor.')
 *      toast.warning('O servidor esta respondendo lentamente.')
 *      toast.info('Dica: voce pode exportar os resultados em PDF.')
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

/* ========================================================================== */
/*  Tipos                                                                      */
/* ========================================================================== */

/** Variantes visuais disponiveis para o toast */
type ToastVariant = 'success' | 'error' | 'warning' | 'info'

/** Dados internos de cada toast na fila */
interface ToastItem {
  /** Identificador unico gerado automaticamente */
  id: number
  /** Variante visual (define cor e icone) */
  variant: ToastVariant
  /** Mensagem exibida ao usuario */
  message: string
  /** Controle de animacao: true quando o toast esta saindo */
  exiting: boolean
}

/** Opcoes opcionais ao criar um toast */
interface ToastOptions {
  /** Tempo em milissegundos antes de fechar automaticamente (padrao: 4000) */
  duration?: number
}

/** Funcoes disponiveis para criar notificacoes */
interface ToastActions {
  success: (message: string, options?: ToastOptions) => void
  error: (message: string, options?: ToastOptions) => void
  warning: (message: string, options?: ToastOptions) => void
  info: (message: string, options?: ToastOptions) => void
}

/** Valor fornecido pelo contexto */
interface ToastContextValue {
  toast: ToastActions
}

/* ========================================================================== */
/*  Configuracao visual por variante                                           */
/* ========================================================================== */

/**
 * Mapa de estilos para cada variante de toast.
 * Usa as cores do design system sf-* para manter consistencia visual.
 */
const VARIANT_CONFIG: Record<
  ToastVariant,
  {
    icon: typeof CheckCircle
    /** Classes Tailwind para o container do toast */
    containerClass: string
    /** Classes Tailwind para o icone */
    iconClass: string
    /** Rotulo em portugues (acessibilidade) */
    label: string
  }
> = {
  success: {
    icon: CheckCircle,
    containerClass: 'border-sf-success/30 bg-sf-success/5',
    iconClass: 'text-sf-success',
    label: 'Sucesso',
  },
  error: {
    icon: XCircle,
    containerClass: 'border-sf-danger/30 bg-sf-danger/5',
    iconClass: 'text-sf-danger',
    label: 'Erro',
  },
  warning: {
    icon: AlertTriangle,
    containerClass: 'border-sf-warning/30 bg-sf-warning/5',
    iconClass: 'text-sf-warning',
    label: 'Aviso',
  },
  info: {
    icon: Info,
    containerClass: 'border-sf-primary/30 bg-sf-primary/5',
    iconClass: 'text-sf-accent',
    label: 'Informacao',
  },
}

/** Duracao padrao em ms antes do toast ser removido automaticamente */
const DEFAULT_DURATION = 4000

/** Duracao da animacao de saida em ms (deve coincidir com a CSS) */
const EXIT_ANIMATION_MS = 300

/* ========================================================================== */
/*  Contexto                                                                   */
/* ========================================================================== */

const ToastContext = createContext<ToastContextValue | null>(null)

/* ========================================================================== */
/*  Provider                                                                   */
/* ========================================================================== */

/**
 * ToastProvider gerencia a fila de notificacoes e renderiza os toasts.
 * Deve envolver a arvore de componentes que precisam exibir notificacoes.
 *
 * Exemplo:
 *   <ToastProvider>
 *     <App />
 *   </ToastProvider>
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counterRef = useRef(0)

  /**
   * Remove um toast da lista (chamado apos a animacao de saida).
   */
  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  /**
   * Inicia a animacao de saida de um toast.
   * Apos EXIT_ANIMATION_MS, o toast e removido definitivamente.
   */
  const dismissToast = useCallback(
    (id: number) => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
      )
      setTimeout(() => removeToast(id), EXIT_ANIMATION_MS)
    },
    [removeToast]
  )

  /**
   * Cria e adiciona um novo toast a fila.
   */
  const addToast = useCallback(
    (variant: ToastVariant, message: string, options?: ToastOptions) => {
      const id = ++counterRef.current
      const duration = options?.duration ?? DEFAULT_DURATION

      setToasts((prev) => [...prev, { id, variant, message, exiting: false }])

      // Agenda o auto-dismiss
      setTimeout(() => dismissToast(id), duration)
    },
    [dismissToast]
  )

  /**
   * Objeto de conveniencia com metodos nomeados por variante.
   * Memorizado para evitar re-renders desnecessarios nos consumidores.
   */
  const toast = useMemo<ToastActions>(
    () => ({
      success: (msg, opts) => addToast('success', msg, opts),
      error: (msg, opts) => addToast('error', msg, opts),
      warning: (msg, opts) => addToast('warning', msg, opts),
      info: (msg, opts) => addToast('info', msg, opts),
    }),
    [addToast]
  )

  const contextValue = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {/* ---- Container dos toasts (canto superior direito) ---- */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          aria-label="Notificacoes"
          className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none max-w-sm"
        >
          {toasts.map((item) => (
            <ToastCard
              key={item.id}
              item={item}
              onDismiss={() => dismissToast(item.id)}
            />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

/* ========================================================================== */
/*  Componente visual do toast individual                                      */
/* ========================================================================== */

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem
  onDismiss: () => void
}) {
  const config = VARIANT_CONFIG[item.variant]
  const Icon = config.icon

  return (
    <div
      role="status"
      aria-label={config.label}
      className={[
        // Base
        'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border',
        'bg-sf-surface shadow-elevated backdrop-blur-sm',
        // Variante (borda colorida + fundo sutil)
        config.containerClass,
        // Animacao de entrada ou saida
        item.exiting ? 'animate-toast-exit' : 'animate-toast-enter',
      ].join(' ')}
    >
      {/* Icone da variante */}
      <Icon
        className={`w-5 h-5 shrink-0 mt-0.5 ${config.iconClass}`}
        aria-hidden="true"
      />

      {/* Mensagem */}
      <p className="flex-1 text-sm text-sf-text leading-relaxed">
        {item.message}
      </p>

      {/* Botao de fechar */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar notificacao"
        className="shrink-0 mt-0.5 p-0.5 rounded-md text-sf-textMuted hover:text-sf-textSecondary hover:bg-sf-surfaceHover transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

/* ========================================================================== */
/*  Hook                                                                       */
/* ========================================================================== */

/**
 * Hook para exibir notificacoes toast em qualquer componente.
 *
 * Uso:
 *   const { toast } = useToast()
 *   toast.success('Operacao realizada com sucesso!')
 *   toast.error('Algo deu errado.')
 *   toast.warning('Atencao: limite quase atingido.')
 *   toast.info('Nova versao disponivel.')
 *
 * Deve ser chamado dentro de um componente envolvido por <ToastProvider>.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error(
      '[StressFlow] useToast() deve ser usado dentro de <ToastProvider>. ' +
        'Verifique se o componente esta envolvido pelo provider.'
    )
  }
  return context
}
