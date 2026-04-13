/**
 * ErrorBoundary.tsx — Barreira de proteção contra erros inesperados
 *
 * Este componente captura erros de renderização do React que ocorrem
 * em qualquer componente filho. Em vez de mostrar uma tela branca ou
 * quebrada, ele exibe uma mensagem amigavel em português explicando
 * que algo deu errado, com opcao de recarregar a aplicação.
 *
 * Para desenvolvedores, um painel expansivel mostra os detalhes
 * técnicos do erro (mensagem e stack trace), facilitando a depuracao.
 *
 * Uso:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 *
 * Nota: Error Boundaries precisam ser class components — o React não
 * oferece hooks equivalentes para componentDidCatch / getDerivedStateFromError.
 */

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Bug,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Tipos                                                                     */
/* -------------------------------------------------------------------------- */

interface ErrorBoundaryProps {
  /** Conteúdo filho que sera renderizado normalmente quando não houver erro */
  children: ReactNode;
}

interface ErrorBoundaryState {
  /** Indica se um erro foi capturado */
  hasError: boolean;
  /** O objeto de erro capturado (se houver) */
  error: Error | null;
  /** Informações adicionais do React sobre onde o erro ocorreu */
  errorInfo: ErrorInfo | null;
  /** Controla se a seção de detalhes técnicos está visível */
  showDetails: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Componente ErrorBoundary                                                  */
/* -------------------------------------------------------------------------- */

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Lifecycle: captura de erros                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * Chamado pelo React quando um erro ocorre durante a renderização
   * de um componente filho. Atualiza o estado para exibir o fallback.
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  /**
   * Chamado após o erro ser capturado. Recebe informações extras do React
   * (como o component stack) e registra no console para depuracao.
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error(
      "[CPX-Stress] Erro capturado pelo ErrorBoundary:",
      error,
      errorInfo,
    );
  }

  /* ---------------------------------------------------------------------- */
  /*  Handlers                                                              */
  /* ---------------------------------------------------------------------- */

  /** Recarrega a aplicação para tentar recuperar do erro */
  private handleReload = (): void => {
    window.location.reload();
  };

  /** Reseta o estado do error boundary para tentar renderizar novamente */
  private handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  /** Alterna a visibilidade do painel de detalhes técnicos */
  private toggleDetails = (): void => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  /* ---------------------------------------------------------------------- */
  /*  Renderização                                                          */
  /* ---------------------------------------------------------------------- */

  render() {
    /* Quando não ha erro, renderiza os filhos normalmente */
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo, showDetails } = this.state;

    /* Monta o texto de detalhes técnicos */
    const technicalDetails = [
      error?.toString(),
      error?.stack,
      errorInfo?.componentStack
        ? `\nComponent Stack:${errorInfo.componentStack}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    return (
      <div className="h-screen w-screen flex items-center justify-center p-6 bg-sf-bg">
        <div
          className="w-full max-w-lg animate-slide-up"
          role="alert"
          aria-live="assertive"
        >
          {/* ---- Card principal ---- */}
          <div className="rounded-2xl border p-8 bg-sf-surface border-sf-border">
            {/* Icone de alerta */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-sf-danger/10">
                <AlertTriangle
                  className="w-8 h-8 text-sf-danger"
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Título */}
            <h1 className="text-xl font-bold text-center mb-2 text-sf-text">
              Ops! Algo deu errado
            </h1>

            {/* Mensagem amigavel */}
            <p className="text-sm text-center leading-relaxed mb-6 text-sf-textSecondary">
              Ocorreu um erro inesperado na aplicação.
              <br />
              Não se preocupe — seus dados de testes anteriores estão salvos.
              <br />
              Tente recarregar a página ou voltar ao estado inicial.
            </p>

            {/* Botões de ação */}
            <div className="flex gap-3 mb-6">
              {/* Botão: Tentar Novamente (reseta o boundary) */}
              <button
                type="button"
                onClick={this.handleRetry}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold
                  flex items-center justify-center gap-2 transition-all
                  hover:scale-[1.01] active:scale-[0.99]
                  bg-sf-primary text-white hover:bg-sf-primaryHover"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Tentar Novamente
              </button>

              {/* Botão: Recarregar Página */}
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold
                  flex items-center justify-center gap-2 transition-all border
                  hover:scale-[1.01] active:scale-[0.99]
                  bg-transparent border-sf-border text-sf-textSecondary
                  hover:bg-sf-surfaceHover hover:text-sf-text"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Recarregar Página
              </button>
            </div>

            {/* Seção expansivel: detalhes técnicos para desenvolvedores */}
            <div className="rounded-xl border bg-sf-bg border-sf-border">
              <button
                type="button"
                onClick={this.toggleDetails}
                aria-expanded={!!showDetails}
                aria-controls="error-details"
                className="w-full px-4 py-3 flex items-center gap-2 text-xs transition-colors
                  text-sf-textMuted hover:text-sf-textSecondary"
              >
                <Bug className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="font-medium">Detalhes técnicos</span>
                <span className="ml-auto">
                  {showDetails ? (
                    <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </span>
              </button>

              {showDetails && (
                <div id="error-details" className="px-4 pb-4 animate-slide-up">
                  {/* Mensagem do erro */}
                  <div className="mb-3">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-sf-danger">
                      Erro
                    </span>
                    <p className="text-xs font-mono mt-1 leading-relaxed text-sf-text">
                      {error?.message || "Erro desconhecido"}
                    </p>
                  </div>

                  {/* Stack trace completo */}
                  <div>
                    <span className="text-2xs font-semibold uppercase tracking-wider text-sf-textMuted">
                      Stack Trace
                    </span>
                    <pre
                      className="mt-1 text-2xs font-mono leading-relaxed
                        overflow-auto max-h-48 rounded-lg p-3 border
                        text-sf-textSecondary bg-sf-bgSubtle border-sf-borderSubtle"
                    >
                      {technicalDetails || "Nenhum detalhe disponível."}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Rodape informativo */}
          <p className="text-center text-2xs mt-4 text-sf-textFaint">
            CPX-Stress &mdash; Se o problema persistir, reinicie a aplicação.
          </p>
        </div>
      </div>
    );
  }
}
