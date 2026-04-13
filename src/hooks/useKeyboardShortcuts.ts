/**
 * useKeyboardShortcuts.ts - Atalhos de teclado globais do CPX-Stress
 *
 * Registra listeners de teclado para acoes comuns da aplicação.
 * O hook deve ser chamado uma unica vez no componente raiz (App.tsx).
 *
 * Atalhos disponiveis:
 *   Ctrl+Enter  — Iniciar teste (quando na tela de configuração)
 *   Escape      — Cancelar teste em execução
 *   Ctrl+N      — Novo teste (voltar a tela de configuração)
 *   Ctrl+H      — Alternar exibicao do histórico
 *   Ctrl+E      — Exportar resultados em PDF (quando na tela de resultados)
 *
 * Eventos customizados disparados:
 *   'stressflow:start-test'     — Ouvido por TestConfig para iniciar o teste
 *   'stressflow:export-results' — Ouvido por TestResults para exportar PDF
 */

import { useEffect, useCallback } from "react";
import { useTestStore } from "@/stores/test-store";

export function useKeyboardShortcuts() {
  const view = useTestStore((s) => s.view);
  const status = useTestStore((s) => s.status);
  const setView = useTestStore((s) => s.setView);
  const setStatus = useTestStore((s) => s.setStatus);
  const clearProgress = useTestStore((s) => s.clearProgress);
  const setCurrentResult = useTestStore((s) => s.setCurrentResult);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const { key, ctrlKey, metaKey } = event;
      const mod = ctrlKey || metaKey;

      // Verifica se o foco esta em um campo de texto (input, textarea ou
      // contentEditable). Nesse caso, atalhos de navegação (Ctrl+N, Ctrl+H,
      // Ctrl+E) devem ser ignorados para não interferir com a digitacao.
      // Ctrl+Enter (submeter) e Escape (cancelar) continuam funcionando
      // pois são padrões de UX esperados dentro de formularios.
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      // --- Enter: Iniciar teste ---
      // Funciona apenas quando o usuário esta na tela de configuração
      // e o teste não esta rodando. Ignorado se estiver digitando em input.
      if (key === "Enter" && !mod) {
        if (isTyping) return;
        if (view === "test" && (status === "idle" || status === "error")) {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("stressflow:start-test"));
        }
        return;
      }

      // --- Escape: Cancelar teste em execução ---
      // Funciona em qualquer tela, desde que haja um teste rodando.
      if (key === "Escape") {
        if (status === "running") {
          event.preventDefault();
          window.stressflow.test.cancel().catch((err) => {
            console.error("[CPX-Stress] Erro ao cancelar teste via atalho:", err);
          });
        }
        return;
      }

      // --- Ctrl+N: Novo teste ---
      // Navega para a tela de configuração e reseta o estado
      // (exceto se houver um teste em andamento).
      // Ignorado quando o usuário esta digitando em um campo de texto.
      if (mod && key.toLowerCase() === "n") {
        if (isTyping) return;
        event.preventDefault();
        setView("test");
        if (status !== "running") {
          setStatus("idle");
          clearProgress();
          setCurrentResult(null);
        }
        return;
      }

      // --- Ctrl+H: Alternar histórico ---
      // Se ja esta no histórico, volta para a tela de teste.
      // Caso contrario, abre o histórico.
      // Ignorado quando o usuário esta digitando em um campo de texto.
      if (mod && key.toLowerCase() === "h") {
        if (isTyping) return;
        event.preventDefault();
        setView(view === "history" ? "test" : "history");
        return;
      }

      // --- Ctrl+E: Exportar resultados em PDF ---
      // Funciona apenas quando ha resultados visiveis na tela.
      // Ignorado quando o usuário esta digitando em um campo de texto.
      if (mod && key.toLowerCase() === "e") {
        if (isTyping) return;
        const hasResults =
          view === "results" ||
          (view === "test" &&
            (status === "completed" || status === "cancelled"));
        if (hasResults) {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("stressflow:export-results"));
        }
        return;
      }
    },
    [view, status, setView, setStatus, clearProgress, setCurrentResult],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
