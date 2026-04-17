/**
 * =============================================================================
 *  CPX-Stress - Preload Bridge (Ponte entre Frontend e Backend)
 * =============================================================================
 *
 *  O QUE FAZ ESTE ARQUIVO?
 *  ------------------------
 *  No Electron, a interface visual (frontend/renderer) roda isolada do sistema
 *  operacional por seguranca. Este arquivo cria uma "ponte" controlada que
 *  permite ao frontend se comunicar com o backend (processo principal) de
 *  forma segura, sem expor acesso direto ao Node.js ou ao sistema de arquivos.
 *
 *  COMO FUNCIONA?
 *  ---------------
 *  1. O frontend chama funções atraves de `window.stressflow` (ex: window.stressflow.test.start(...))
 *  2. Essas chamadas são enviadas ao processo principal via canais IPC (Inter-Process Communication)
 *  3. O processo principal executa a operação e retorna o resultado
 *
 *  POR QUE E IMPORTANTE?
 *  ----------------------
 *  - Seguranca: Apenas canais IPC explicitamente listados são permitidos
 *  - Isolamento: O frontend nunca acessa o Node.js diretamente
 *  - Controle: Cada função exposta e tipada e documentada
 *
 * =============================================================================
 */

import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type {
  PersistedExternalBenchmarks,
  TestConfig,
  ProgressData,
  TestResult,
} from "./engine/stress-engine";
import type { K6Config, K6Summary } from "./engine/k6-types";
import type { LocustConfig, LocustSummary } from "./engine/locust-types";
import type { JMeterConfig, JMeterSummary } from "./engine/jmeter-types";
import type { MistertValidationResult } from "../src/shared/mistert-validation";

// -----------------------------------------------------------------------------
// Canais IPC permitidos (whitelist de seguranca)
// -----------------------------------------------------------------------------
// Apenas estes canais podem ser usados para comunicação entre processos.
// Qualquer canal fora desta lista sera rejeitado, prevenindo acesso indevido.
// -----------------------------------------------------------------------------

/** Canais que o frontend pode invocar e aguardar resposta (request/response) */
const ALLOWED_INVOKE_CHANNELS = [
  "test:start",
  "test:cancel",
  "validation:run",
  "history:list",
  "history:get",
  "history:saveBenchmarks",
  "history:delete",
  "history:clear",
  "pdf:save",
  "pdf:open",
  "json:export",
  "app:getPath",
  "errors:search",
  "errors:byStatusCode",
  "errors:byErrorType",
  "errors:byOperationName",
  "credentials:status",
  "credentials:save",
  "credentials:load",
  "presets:list",
  "presets:save",
  "presets:rename",
  "presets:delete",
  "k6:check",
  "k6:run",
  "locust:check",
  "locust:run",
  "jmeter:check",
  "jmeter:run",
] as const;

/** Canais que o frontend pode escutar para receber dados em tempo real */
const ALLOWED_RECEIVE_CHANNELS = [
  "test:progress",
  "k6:progress",
  "locust:progress",
  "jmeter:progress",
] as const;

// Tipos derivados das listas de canais permitidos
type InvokeChannel = (typeof ALLOWED_INVOKE_CHANNELS)[number];
type ReceiveChannel = (typeof ALLOWED_RECEIVE_CHANNELS)[number];

// -----------------------------------------------------------------------------
// Funções auxiliares com validação de canal (camada de seguranca)
// -----------------------------------------------------------------------------

/**
 * Envia uma mensagem ao processo principal e aguarda a resposta.
 * Valida se o canal está na lista de canais permitidos antes de enviar.
 */
function safeInvoke(
  channel: InvokeChannel,
  ...args: unknown[]
): Promise<unknown> {
  if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
    return Promise.reject(new Error(`Canal IPC não permitido: ${channel}`));
  }
  return ipcRenderer.invoke(channel, ...args);
}

/**
 * Registra um listener para receber mensagens em tempo real do processo principal.
 * Retorna uma função de cleanup para remover o listener quando não for mais necessário.
 */
function safeOnReceive(
  channel: ReceiveChannel,
  callback: (data: unknown) => void,
): () => void {
  if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
    throw new Error(`Canal IPC não permitido: ${channel}`);
  }
  const handler = (_event: IpcRendererEvent, data: unknown) => callback(data);
  ipcRenderer.on(channel, handler);

  // Retorna função para cancelar a escuta (evita vazamento de memória)
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

// -----------------------------------------------------------------------------
// API exposta ao frontend (window.stressflow)
// -----------------------------------------------------------------------------
// Cada grupo representa um dominio funcional da aplicação.
// Todas as funções são assincronas e retornam Promises.
// -----------------------------------------------------------------------------

const api = {
  // ---------------------------------------------------------------------------
  // Testes de estresse - iniciar, cancelar e acompanhar progresso
  // ---------------------------------------------------------------------------
  test: {
    /** Inicia um novo teste de estresse com a configuração fornecida */
    start: (config: TestConfig): Promise<TestResult> =>
      safeInvoke("test:start", config) as Promise<TestResult>,

    /** Cancela o teste de estresse em execução */
    cancel: (): Promise<boolean> =>
      safeInvoke("test:cancel") as Promise<boolean>,

    /**
     * Registra callback para receber atualizacoes de progresso do teste em tempo real.
     * Retorna função de cleanup para parar de receber atualizacoes.
     *
     * Exemplo de uso:
     *   const parar = window.stressflow.test.onProgress((dados) => { ... })
     *   parar() // quando não quiser mais receber atualizacoes
     */
    onProgress: (callback: (data: ProgressData) => void): (() => void) =>
      safeOnReceive("test:progress", callback as (data: unknown) => void),
  },

  // ---------------------------------------------------------------------------
  // Validação pré-teste — confirma sessão, extração dinâmica e evidência de aba
  // ---------------------------------------------------------------------------
  validation: {
    /** Executa uma passada sequencial pelo fluxo MisterT atual e retorna um relatório técnico/funcional. */
    run: (config: TestConfig): Promise<MistertValidationResult> =>
      safeInvoke("validation:run", config) as Promise<MistertValidationResult>,
  },

  // ---------------------------------------------------------------------------
  // Histórico - listar, buscar, excluir e limpar resultados anteriores
  // ---------------------------------------------------------------------------
  history: {
    /** Lista todos os resultados de testes salvos */
    list: (): Promise<TestResult[]> =>
      safeInvoke("history:list") as Promise<TestResult[]>,

    /** Busca um resultado específico pelo seu identificador */
    get: (id: string): Promise<TestResult | null> =>
      safeInvoke("history:get", id) as Promise<TestResult | null>,

    /** Persiste o snapshot atual dos benchmarks externos em um resultado salvo. */
    saveBenchmarks: (
      id: string,
      benchmarks: PersistedExternalBenchmarks,
    ): Promise<boolean> =>
      safeInvoke("history:saveBenchmarks", id, benchmarks) as Promise<boolean>,

    /** Exclui um resultado específico do histórico */
    delete: (id: string): Promise<boolean> =>
      safeInvoke("history:delete", id) as Promise<boolean>,

    /** Remove todos os resultados do histórico */
    clear: (): Promise<boolean> =>
      safeInvoke("history:clear") as Promise<boolean>,
  },

  // ---------------------------------------------------------------------------
  // PDF - salvar e abrir relatórios gerados
  // ---------------------------------------------------------------------------
  pdf: {
    /** Salva o conteúdo PDF (em base64) como arquivo e retorna o caminho salvo */
    save: (base64: string, filename: string): Promise<string> =>
      safeInvoke("pdf:save", base64, filename) as Promise<string>,

    /** Abre um arquivo PDF salvo usando o aplicativo padrão do sistema */
    open: (filePath: string): Promise<void> =>
      safeInvoke("pdf:open", filePath) as Promise<void>,
  },

  // ---------------------------------------------------------------------------
  // JSON - exportar dados de resultados
  // ---------------------------------------------------------------------------
  json: {
    /** Exporta dados como arquivo JSON, abrindo dialogo para escolher destino */
    export: (data: string, defaultName: string): Promise<string | null> =>
      safeInvoke("json:export", data, defaultName) as Promise<string | null>,
  },

  // ---------------------------------------------------------------------------
  // Aplicação - informações gerais
  // ---------------------------------------------------------------------------
  app: {
    /** Retorna o caminho do diretório de dados da aplicação */
    getPath: (): Promise<string> =>
      safeInvoke("app:getPath") as Promise<string>,
  },

  // ---------------------------------------------------------------------------
  // k6 - benchmark externo para comparação de métricas
  // ---------------------------------------------------------------------------
  k6: {
    /** Verifica se o binário do k6 está disponível para uso. */
    check: (): Promise<boolean> =>
      safeInvoke("k6:check") as Promise<boolean>,

    /** Executa o benchmark k6 usando o config fornecido. */
    run: (config: K6Config): Promise<K6Summary> =>
      safeInvoke("k6:run", config) as Promise<K6Summary>,
  },

  /** Alias flat para compatibilidade com a documentação da integração. */
  k6Check: (): Promise<boolean> => safeInvoke("k6:check") as Promise<boolean>,

  /** Alias flat para compatibilidade com a documentação da integração. */
  k6Run: (config: K6Config): Promise<K6Summary> =>
    safeInvoke("k6:run", config) as Promise<K6Summary>,

  /** Escuta o progresso textual emitido pelo subprocesso k6. */
  onK6Progress: (callback: (line: string) => void): (() => void) =>
    safeOnReceive("k6:progress", callback as (data: unknown) => void),

  // ---------------------------------------------------------------------------
  // Locust - benchmark externo para comparação de métricas
  // ---------------------------------------------------------------------------
  locust: {
    /** Verifica se o binário do Locust está disponível para uso. */
    check: (): Promise<boolean> =>
      safeInvoke("locust:check") as Promise<boolean>,

    /** Executa o benchmark Locust usando o config fornecido. */
    run: (config: LocustConfig): Promise<LocustSummary> =>
      safeInvoke("locust:run", config) as Promise<LocustSummary>,
  },

  /** Alias flat para compatibilidade e consumo simples no renderer. */
  locustCheck: (): Promise<boolean> =>
    safeInvoke("locust:check") as Promise<boolean>,

  /** Alias flat para compatibilidade e consumo simples no renderer. */
  locustRun: (config: LocustConfig): Promise<LocustSummary> =>
    safeInvoke("locust:run", config) as Promise<LocustSummary>,

  /** Escuta o progresso textual emitido pelo subprocesso Locust. */
  onLocustProgress: (callback: (line: string) => void): (() => void) =>
    safeOnReceive("locust:progress", callback as (data: unknown) => void),

  // ---------------------------------------------------------------------------
  // JMeter - benchmark externo para comparação de métricas
  // ---------------------------------------------------------------------------
  jmeter: {
    check: (): Promise<boolean> =>
      safeInvoke("jmeter:check") as Promise<boolean>,

    run: (config: JMeterConfig): Promise<JMeterSummary> =>
      safeInvoke("jmeter:run", config) as Promise<JMeterSummary>,
  },

  jmeterCheck: (): Promise<boolean> =>
    safeInvoke("jmeter:check") as Promise<boolean>,

  jmeterRun: (config: JMeterConfig): Promise<JMeterSummary> =>
    safeInvoke("jmeter:run", config) as Promise<JMeterSummary>,

  onJMeterProgress: (callback: (line: string) => void): (() => void) =>
    safeOnReceive("jmeter:progress", callback as (data: unknown) => void),

  // ---------------------------------------------------------------------------
  // Erros - consulta e análise de erros detalhados armazenados no SQLite
  // ---------------------------------------------------------------------------
  errors: {
    /** Busca erros com filtros opcionais (testId, statusCode, errorType, operationName, período) */
    search: (params: {
      testId?: string;
      statusCode?: number;
      errorType?: string;
      operationName?: string;
      timestampStart?: number;
      timestampEnd?: number;
      limit?: number;
      offset?: number;
    }): Promise<{ records: unknown[]; total: number }> =>
      safeInvoke("errors:search", params) as Promise<{
        records: unknown[];
        total: number;
      }>,

    /** Retorna contagem de erros agrupados por status code */
    byStatusCode: (testId: string): Promise<Record<string, number>> =>
      safeInvoke("errors:byStatusCode", testId) as Promise<
        Record<string, number>
      >,

    /** Retorna contagem de erros agrupados por tipo */
    byErrorType: (testId: string): Promise<Record<string, number>> =>
      safeInvoke("errors:byErrorType", testId) as Promise<
        Record<string, number>
      >,

    /** Retorna contagem de erros agrupados por nome de operação */
    byOperationName: (testId: string): Promise<Record<string, number>> =>
      safeInvoke("errors:byOperationName", testId) as Promise<
        Record<string, number>
      >,
  },

  // ---------------------------------------------------------------------------
  // Credenciais — verificar status, listar chaves e salvar credenciais MisterT
  // SEGURANCA: Nenhuma função retorna valores — apenas booleanos ou nomes de chaves.
  // ---------------------------------------------------------------------------
  credentials: {
    /** Verifica quais credenciais obrigatorias estão configuradas (retorna booleanos, nunca valores) */
    status: (): Promise<Record<string, boolean>> =>
      safeInvoke("credentials:status") as Promise<Record<string, boolean>>,

    /** Retorna lista de nomes de chaves STRESSFLOW_* configuradas (nunca valores) */
    load: (): Promise<string[]> =>
      safeInvoke("credentials:load") as Promise<string[]>,

    /** Salva credenciais no .env (main process escreve o arquivo). Campos vazios são ignorados. */
    save: (
      entries: Array<{ key: string; value: string }>,
    ): Promise<{ saved: number; path: string }> =>
      safeInvoke("credentials:save", entries) as Promise<{
        saved: number;
        path: string;
      }>,
  },

  // ---------------------------------------------------------------------------
  // Presets — listar, salvar, renomear e deletar presets de teste
  // ---------------------------------------------------------------------------
  presets: {
    /** Lista todos os presets (built-in primeiro, depois usuário por nome). */
    list: (): Promise<unknown[]> =>
      safeInvoke("presets:list") as Promise<unknown[]>,

    /** Salva novo preset ou atualiza existente. Retorna o preset salvo. */
    save: (data: {
      id?: string;
      name: string;
      configJson: string;
    }): Promise<unknown> =>
      safeInvoke("presets:save", data) as Promise<unknown>,

    /** Renomeia um preset do usuário (built-in rejeitado). */
    rename: (id: string, newName: string): Promise<void> =>
      safeInvoke("presets:rename", id, newName) as Promise<void>,

    /** Deleta um preset do usuário (built-in rejeitado). */
    delete: (id: string): Promise<void> =>
      safeInvoke("presets:delete", id) as Promise<void>,
  },
};

// -----------------------------------------------------------------------------
// Exposicao segura da API ao contexto do navegador
// -----------------------------------------------------------------------------
// O contextBridge.exposeInMainWorld garante que apenas o objeto `api` definido
// acima fique acessível ao frontend via `window.stressflow`. Nenhuma outra
// funcionalidade do Node.js ou do Electron e exposta, mantendo o isolamento.
// -----------------------------------------------------------------------------
contextBridge.exposeInMainWorld("stressflow", api);
