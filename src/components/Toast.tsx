/**
 * Toast.tsx - Sistema de notificações (toast) do CPX-Stress
 *
 * Implementacao leve e sem dependencias externas para exibir
 * notificações temporarias ao usuário (sucesso, erro, aviso, info).
 *
 * Uso:
 *   1. Envolva a aplicação com <ToastProvider>
 *   2. Em qualquer componente filho, use o hook useToast():
 *
 *      const { toast } = useToast()
 *      toast.success('Teste concluido com sucesso!')
 *      toast.error('Falha ao conectar com o servidor.')
 *      toast.warning('O servidor está respondendo lentamente.')
 *      toast.info('Dica: você pode exportar os resultados em PDF.')
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

/* ========================================================================== */
/*  Tipos                                                                      */
/* ========================================================================== */

/** Variantes visuais disponiveis para o toast */
type ToastVariant = "success" | "error" | "warning" | "info";

/** Dados internos de cada toast na fila */
interface ToastItem {
  /** Identificador único gerado automaticamente */
  id: number;
  /** Variante visual (define cor e icone) */
  variant: ToastVariant;
  /** Mensagem exibida ao usuário */
  message: string;
  /** Controle de animação: true quando o toast está saindo */
  exiting: boolean;
}

/** Opcoes opcionais ao criar um toast */
interface ToastOptions {
  /** Tempo em milissegundos antes de fechar automaticamente (padrão: 4000) */
  duration?: number;
}

/** Funções disponiveis para criar notificações */
interface ToastActions {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
}

/** Valor fornecido pelo contexto */
interface ToastContextValue {
  toast: ToastActions;
}

/* ========================================================================== */
/*  Configuração visual por variante                                           */
/* ========================================================================== */

/**
 * Mapa de estilos para cada variante de toast.
 * Usa as cores do design system sf-* para manter consistencia visual.
 */
const VARIANT_CONFIG: Record<
  ToastVariant,
  {
    icon: typeof CheckCircle;
    /** Classes Tailwind para o container do toast */
    containerClass: string;
    /** Classes Tailwind para o icone */
    iconClass: string;
    /** Rótulo em português (acessibilidade) */
    label: string;
  }
> = {
  success: {
    icon: CheckCircle,
    containerClass: "border-sf-success/30 bg-sf-success/5",
    iconClass: "text-sf-success",
    label: "Sucesso",
  },
  error: {
    icon: XCircle,
    containerClass: "border-sf-danger/30 bg-sf-danger/5",
    iconClass: "text-sf-danger",
    label: "Erro",
  },
  warning: {
    icon: AlertTriangle,
    containerClass: "border-sf-warning/30 bg-sf-warning/5",
    iconClass: "text-sf-warning",
    label: "Aviso",
  },
  info: {
    icon: Info,
    containerClass: "border-sf-primary/30 bg-sf-primary/5",
    iconClass: "text-sf-accent",
    label: "Informação",
  },
};

/** Duração padrão em ms antes do toast ser removido automaticamente */
const DEFAULT_DURATION = 4000;

/** Duração da animação de saída em ms (deve coincidir com a CSS) */
const EXIT_ANIMATION_MS = 300;

/* ========================================================================== */
/*  Contexto                                                                   */
/* ========================================================================== */

const ToastContext = createContext<ToastContextValue | null>(null);

/* ========================================================================== */
/*  Provider                                                                   */
/* ========================================================================== */

/**
 * ToastProvider gerencia a fila de notificações e renderiza os toasts.
 * Deve envolver a arvore de componentes que precisam exibir notificações.
 *
 * Exemplo:
 *   <ToastProvider>
 *     <App />
 *   </ToastProvider>
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  /**
   * Remove um toast da lista (chamado após a animação de saída).
   */
  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /**
   * Inicia a animação de saída de um toast.
   * Após EXIT_ANIMATION_MS, o toast e removido definitivamente.
   */
  const dismissToast = useCallback(
    (id: number) => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
      );
      setTimeout(() => removeToast(id), EXIT_ANIMATION_MS);
    },
    [removeToast],
  );

  /**
   * Cria e adiciona um novo toast a fila.
   */
  const addToast = useCallback(
    (variant: ToastVariant, message: string, options?: ToastOptions) => {
      const id = ++counterRef.current;
      const duration = options?.duration ?? DEFAULT_DURATION;

      setToasts((prev) => [...prev, { id, variant, message, exiting: false }]);

      // Agenda o auto-dismiss
      setTimeout(() => dismissToast(id), duration);
    },
    [dismissToast],
  );

  /**
   * Objeto de conveniencia com métodos nomeados por variante.
   * Memorizado para evitar re-renders desnecessarios nos consumidores.
   */
  const toast = useMemo<ToastActions>(
    () => ({
      success: (msg, opts) => addToast("success", msg, opts),
      error: (msg, opts) => addToast("error", msg, opts),
      warning: (msg, opts) => addToast("warning", msg, opts),
      info: (msg, opts) => addToast("info", msg, opts),
    }),
    [addToast],
  );

  const contextValue = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {/* ---- Container dos toasts (canto superior direito) ---- */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          aria-label="Notificações"
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
  );
}

/* ========================================================================== */
/*  Componente visual do toast individual                                      */
/* ========================================================================== */

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  const config = VARIANT_CONFIG[item.variant];
  const Icon = config.icon;

  return (
    <div
      role="status"
      aria-label={config.label}
      className={[
        // Base
        "pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border",
        "bg-sf-surface shadow-elevated backdrop-blur-sm",
        // Variante (borda colorida + fundo sutil)
        config.containerClass,
        // Animação de entrada ou saída
        item.exiting ? "animate-toast-exit" : "animate-toast-enter",
      ].join(" ")}
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

      {/* Botão de fechar */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar notificação"
        className="shrink-0 mt-0.5 p-0.5 rounded-md text-sf-textMuted hover:text-sf-textSecondary hover:bg-sf-surfaceHover transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ========================================================================== */
/*  Hook                                                                       */
/* ========================================================================== */

/**
 * Hook para exibir notificações toast em qualquer componente.
 *
 * Uso:
 *   const { toast } = useToast()
 *   toast.success('Operação realizada com sucesso!')
 *   toast.error('Algo deu errado.')
 *   toast.warning('Atenção: limite quase atingido.')
 *   toast.info('Nova versão disponível.')
 *
 * Deve ser chamado dentro de um componente envolvido por <ToastProvider>.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error(
      "[CPX-Stress] useToast() deve ser usado dentro de <ToastProvider>. " +
        "Verifique se o componente esta envolvido pelo provider.",
    );
  }
  return context;
}
