/**
 * main.tsx - Ponto de entrada da aplicação StressFlow
 *
 * Este arquivo e responsável por:
 *   1. Registrar tratadores globais de erros não capturados (JS e Promises)
 *   2. Fornecer um Error Boundary de nivel raiz para capturar falhas de renderização
 *   3. Montar o React na DOM dentro do StrictMode
 *
 * Qualquer erro inesperado que escapar dos componentes sera capturado aqui,
 * evitando que a aplicação quebre silenciosamente.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./index.css";

/* -------------------------------------------------------------------------- */
/*  Tratadores globais de erros                                               */
/* -------------------------------------------------------------------------- */

/**
 * Captura erros de JavaScript não tratados em qualquer parte da aplicação.
 * Util para registrar falhas que ocorrem fora do ciclo de renderização do React.
 */
window.onerror = (mensagem, origem, linha, coluna, erro) => {
  console.error("[StressFlow] Erro global não tratado:", {
    mensagem,
    origem,
    linha,
    coluna,
    erro,
  });
};

/**
 * Captura rejeicoes de Promises que não possuem .catch().
 * Sem este tratador, essas falhas seriam engolidas silenciosamente.
 */
window.onunhandledrejection = (evento: PromiseRejectionEvent) => {
  console.error(
    "[StressFlow] Promise rejeitada sem tratamento:",
    evento.reason,
  );
};

/* -------------------------------------------------------------------------- */
/*  Montagem da aplicação na DOM                                              */
/* -------------------------------------------------------------------------- */

/**
 * Localiza o elemento raiz no HTML e monta a arvore React.
 * O React.StrictMode ativa verificacoes adicionais em desenvolvimento
 * (renderizacoes duplas, alertas de APIs depreciadas, etc.).
 */
const elementoRaiz = document.getElementById("root");

if (!elementoRaiz) {
  throw new Error(
    "[StressFlow] Elemento #root não encontrado no HTML. Verifique o arquivo index.html.",
  );
}

ReactDOM.createRoot(elementoRaiz).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
