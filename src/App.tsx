/**
 * App.tsx - Componente principal do StressFlow
 *
 * Este arquivo e o ponto de entrada visual da aplicação.
 * Ele monta a estrutura geral da tela (layout, menu lateral e conteúdo principal)
 * e decide qual página mostrar com base no estado atual do aplicativo.
 *
 * Fluxo do usuário:
 *   1. O usuário abre o app e ve a tela de configuração do teste (TestConfig)
 *   2. Ao iniciar um teste, a tela muda para o progresso em tempo real (TestProgress)
 *   3. Quando o teste termina (ou e cancelado), aparecem os resultados (TestResults)
 *   4. O usuário pode navegar pelo histórico de testes anteriores (HistoryPanel)
 */

import { useEffect, useState, useCallback, memo } from "react";
import { Loader2 } from "lucide-react";
import { useTestStore } from "@/stores/test-store";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { Layout } from "@/components/Layout";
import { Sidebar } from "@/components/Sidebar";
import { TestConfig } from "@/components/TestConfig";
import { TestProgress } from "@/components/TestProgress";
import { TestResults } from "@/components/TestResults";
import { HistoryPanel } from "@/components/HistoryPanel";
import { CredentialsSettings } from "@/components/CredentialsSettings";
import { CrossTestAnalysis } from "@/components/CrossTestAnalysis";
import { ToastProvider } from "@/components/Toast";
import { WelcomeOverlay } from "@/components/WelcomeOverlay";
import type { AppView, TestStatus } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Componente principal da aplicação                                         */
/* -------------------------------------------------------------------------- */

export default function App() {
  /*
   * Estado global da aplicação (gerenciado pelo Zustand).
   * - view:       qual página esta sendo exibida (teste, histórico ou resultados)
   * - status:     em que etapa o teste esta (parado, rodando, concluido, etc.)
   * - setHistory: função para salvar a lista de testes anteriores no estado
   * - setError:   função para registrar mensagens de erro
   */
  const view = useTestStore((s) => s.view);
  const status = useTestStore((s) => s.status);
  const setHistory = useTestStore((s) => s.setHistory);
  const setError = useTestStore((s) => s.setError);

  /**
   * Atalhos de teclado globais da aplicação.
   * Ctrl+Enter: iniciar teste | Escape: cancelar | Ctrl+N: novo teste
   * Ctrl+H: alternar histórico | Ctrl+E: exportar resultados
   */
  useKeyboardShortcuts();

  /**
   * Controle de carregamento inicial.
   * Enquanto o histórico esta sendo carregado do disco, exibimos
   * um indicador sutil para que o usuário saiba que o app esta pronto.
   */
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  /**
   * Carrega o histórico de testes salvos quando o aplicativo inicia.
   *
   * Isso permite que o usuário veja testes anteriores mesmo depois
   * de fechar e reabrir o programa. Caso ocorra algum erro na leitura,
   * o histórico fica vazio e um aviso e exibido no console.
   */
  const loadHistory = useCallback(async () => {
    try {
      const savedHistory = await window.stressflow.history.list();
      setHistory(savedHistory);
    } catch (err) {
      console.warn("[StressFlow] Não foi possível carregar o histórico:", err);
      setError("Falha ao carregar histórico de testes anteriores.");
    } finally {
      setIsLoadingHistory(false);
    }
  }, [setHistory, setError]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /**
   * Verifica o status das credenciais MisterT ao iniciar o aplicativo.
   * O resultado (mapa booleano) e armazenado no Zustand store para que
   * o banner de alerta em TestConfig saiba se deve ser exibido.
   */
  const setCredentialStatus = useTestStore((s) => s.setCredentialStatus);

  const checkCredentials = useCallback(async () => {
    try {
      const status = await window.stressflow.credentials.status();
      setCredentialStatus(status);
    } catch (err) {
      console.warn("[StressFlow] Nao foi possivel verificar credenciais:", err);
    }
  }, [setCredentialStatus]);

  useEffect(() => {
    checkCredentials();
  }, [checkCredentials]);

  return (
    <ToastProvider>
      <Layout>
        {/* Container principal: menu lateral + area de conteúdo */}
        <div className="flex h-full">
          {/* Menu lateral com navegação (Novo Teste, Histórico, etc.) */}
          <Sidebar />

          {/* Area de conteúdo principal — muda conforme a página ativa */}
          <main className="flex-1 overflow-auto px-4 py-2 flex justify-center">
            <div className="w-full max-w-4xl my-auto">
              <MainContent
                view={view}
                status={status}
                isLoading={isLoadingHistory}
              />
            </div>
          </main>
        </div>
      </Layout>
      <WelcomeOverlay />
    </ToastProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Componente que decide qual conteúdo mostrar na area principal              */
/* -------------------------------------------------------------------------- */

/**
 * MainContent renderiza a página correta com base na navegação e no
 * estado atual do teste. Essa separacao torna o App.tsx mais limpo
 * e facilita entender o fluxo de telas.
 *
 * Mapa de telas:
 *   - view="test"    + status="idle"                   -> Formulario de configuração
 *   - view="test"    + status="running"                -> Progresso em tempo real
 *   - view="test"    + status="completed"/"cancelled"  -> Resultados do teste
 *   - view="test"    + status="error"                  -> Formulario (com erro exibido)
 *   - view="history"                                   -> Lista de testes anteriores
 *   - view="results"                                   -> Detalhes de um teste do histórico
 */
// Otimizacao: React.memo evita re-renderização do MainContent quando props
// (view, status, isLoading) não mudam. Sem memo, qualquer mudanca no App
// (ex: re-render por contexto) forçaria MainContent a re-renderizar também,
// recriando toda a arvore de componentes filhos desnecessariamente.
const MainContent = memo(function MainContent({
  view,
  status,
  isLoading,
}: {
  view: AppView;
  status: TestStatus;
  isLoading: boolean;
}) {
  /* ---- Carregamento inicial: exibe spinner enquanto o histórico e carregado ---- */
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 animate-slide-up">
        <Loader2
          className="w-8 h-8 text-sf-primary animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm text-sf-textSecondary">Carregando dados...</p>
      </div>
    );
  }

  /* ---- Pagina: Configuracoes de credenciais e ambiente ---- */
  if (view === "settings") {
    return <CredentialsSettings />;
  }

  /* ---- Página: Histórico de testes anteriores ---- */
  if (view === "history") {
    return <HistoryPanel />;
  }

  /* ---- Página: Visualização detalhada de um resultado do histórico ---- */
  if (view === "results") {
    return <TestResults />;
  }

  /* ---- Pagina: Analise comparativa de erros entre testes ---- */
  if (view === "analysis") {
    return <CrossTestAnalysis />;
  }

  /* ---- Página: Fluxo principal do teste (configurar -> executar -> resultado) ---- */

  /*
   * Quando o teste esta parado ("idle") ou deu erro,
   * mostramos o formulario de configuração para o usuário
   * poder (re)configurar e iniciar um novo teste.
   */
  if (status === "idle" || status === "error") {
    return <TestConfig />;
  }

  /*
   * Quando o teste esta em execução, mostramos a tela de progresso
   * com métricas atualizadas em tempo real (RPS, latência, erros, etc.).
   */
  if (status === "running") {
    return <TestProgress />;
  }

  /*
   * Quando o teste terminou (concluido ou cancelado pelo usuário),
   * mostramos a tela de resultados com gráficos, score de saude
   * e recomendações.
   */
  if (status === "completed" || status === "cancelled") {
    return <TestResults />;
  }

  /*
   * Fallback de seguranca: caso nenhuma condicao acima seja atendida
   * (o que não deveria acontecer em uso normal), voltamos ao formulario.
   * Isso evita que o usuário veja uma tela em branco.
   */
  return <TestConfig />;
});
