/**
 * =============================================================================
 *  StressFlow - Preload Bridge (Ponte entre Frontend e Backend)
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
 *  1. O frontend chama funcoes atraves de `window.stressflow` (ex: window.stressflow.test.start(...))
 *  2. Essas chamadas sao enviadas ao processo principal via canais IPC (Inter-Process Communication)
 *  3. O processo principal executa a operacao e retorna o resultado
 *
 *  POR QUE E IMPORTANTE?
 *  ----------------------
 *  - Seguranca: Apenas canais IPC explicitamente listados sao permitidos
 *  - Isolamento: O frontend nunca acessa o Node.js diretamente
 *  - Controle: Cada funcao exposta e tipada e documentada
 *
 * =============================================================================
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { TestConfig, ProgressData, TestResult } from './engine/stress-engine'

// -----------------------------------------------------------------------------
// Canais IPC permitidos (whitelist de seguranca)
// -----------------------------------------------------------------------------
// Apenas estes canais podem ser usados para comunicacao entre processos.
// Qualquer canal fora desta lista sera rejeitado, prevenindo acesso indevido.
// -----------------------------------------------------------------------------

/** Canais que o frontend pode invocar e aguardar resposta (request/response) */
const ALLOWED_INVOKE_CHANNELS = [
  'test:start',
  'test:cancel',
  'history:list',
  'history:get',
  'history:delete',
  'history:clear',
  'pdf:save',
  'pdf:open',
  'json:export',
  'app:getPath',
] as const

/** Canais que o frontend pode escutar para receber dados em tempo real */
const ALLOWED_RECEIVE_CHANNELS = [
  'test:progress',
] as const

// Tipos derivados das listas de canais permitidos
type InvokeChannel = typeof ALLOWED_INVOKE_CHANNELS[number]
type ReceiveChannel = typeof ALLOWED_RECEIVE_CHANNELS[number]

// -----------------------------------------------------------------------------
// Funcoes auxiliares com validacao de canal (camada de seguranca)
// -----------------------------------------------------------------------------

/**
 * Envia uma mensagem ao processo principal e aguarda a resposta.
 * Valida se o canal esta na lista de canais permitidos antes de enviar.
 */
function safeInvoke(channel: InvokeChannel, ...args: unknown[]): Promise<unknown> {
  if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
    return Promise.reject(new Error(`Canal IPC nao permitido: ${channel}`))
  }
  return ipcRenderer.invoke(channel, ...args)
}

/**
 * Registra um listener para receber mensagens em tempo real do processo principal.
 * Retorna uma funcao de cleanup para remover o listener quando nao for mais necessario.
 */
function safeOnReceive(
  channel: ReceiveChannel,
  callback: (data: unknown) => void,
): () => void {
  if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
    throw new Error(`Canal IPC nao permitido: ${channel}`)
  }
  const handler = (_event: IpcRendererEvent, data: unknown) => callback(data)
  ipcRenderer.on(channel, handler)

  // Retorna funcao para cancelar a escuta (evita vazamento de memoria)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

// -----------------------------------------------------------------------------
// API exposta ao frontend (window.stressflow)
// -----------------------------------------------------------------------------
// Cada grupo representa um dominio funcional da aplicacao.
// Todas as funcoes sao assincronas e retornam Promises.
// -----------------------------------------------------------------------------

const api = {

  // ---------------------------------------------------------------------------
  // Testes de estresse - iniciar, cancelar e acompanhar progresso
  // ---------------------------------------------------------------------------
  test: {
    /** Inicia um novo teste de estresse com a configuracao fornecida */
    start: (config: TestConfig): Promise<TestResult> =>
      safeInvoke('test:start', config) as Promise<TestResult>,

    /** Cancela o teste de estresse em execucao */
    cancel: (): Promise<boolean> =>
      safeInvoke('test:cancel') as Promise<boolean>,

    /**
     * Registra callback para receber atualizacoes de progresso do teste em tempo real.
     * Retorna funcao de cleanup para parar de receber atualizacoes.
     *
     * Exemplo de uso:
     *   const parar = window.stressflow.test.onProgress((dados) => { ... })
     *   parar() // quando nao quiser mais receber atualizacoes
     */
    onProgress: (callback: (data: ProgressData) => void): (() => void) =>
      safeOnReceive('test:progress', callback as (data: unknown) => void),
  },

  // ---------------------------------------------------------------------------
  // Historico - listar, buscar, excluir e limpar resultados anteriores
  // ---------------------------------------------------------------------------
  history: {
    /** Lista todos os resultados de testes salvos */
    list: (): Promise<TestResult[]> =>
      safeInvoke('history:list') as Promise<TestResult[]>,

    /** Busca um resultado especifico pelo seu identificador */
    get: (id: string): Promise<TestResult | null> =>
      safeInvoke('history:get', id) as Promise<TestResult | null>,

    /** Exclui um resultado especifico do historico */
    delete: (id: string): Promise<boolean> =>
      safeInvoke('history:delete', id) as Promise<boolean>,

    /** Remove todos os resultados do historico */
    clear: (): Promise<boolean> =>
      safeInvoke('history:clear') as Promise<boolean>,
  },

  // ---------------------------------------------------------------------------
  // PDF - salvar e abrir relatorios gerados
  // ---------------------------------------------------------------------------
  pdf: {
    /** Salva o conteudo PDF (em base64) como arquivo e retorna o caminho salvo */
    save: (base64: string, filename: string): Promise<string> =>
      safeInvoke('pdf:save', base64, filename) as Promise<string>,

    /** Abre um arquivo PDF salvo usando o aplicativo padrao do sistema */
    open: (filePath: string): Promise<void> =>
      safeInvoke('pdf:open', filePath) as Promise<void>,
  },

  // ---------------------------------------------------------------------------
  // JSON - exportar dados de resultados
  // ---------------------------------------------------------------------------
  json: {
    /** Exporta dados como arquivo JSON, abrindo dialogo para escolher destino */
    export: (data: string, defaultName: string): Promise<string | null> =>
      safeInvoke('json:export', data, defaultName) as Promise<string | null>,
  },

  // ---------------------------------------------------------------------------
  // Aplicacao - informacoes gerais
  // ---------------------------------------------------------------------------
  app: {
    /** Retorna o caminho do diretorio de dados da aplicacao */
    getPath: (): Promise<string> =>
      safeInvoke('app:getPath') as Promise<string>,
  },
}

// -----------------------------------------------------------------------------
// Exposicao segura da API ao contexto do navegador
// -----------------------------------------------------------------------------
// O contextBridge.exposeInMainWorld garante que apenas o objeto `api` definido
// acima fique acessivel ao frontend via `window.stressflow`. Nenhuma outra
// funcionalidade do Node.js ou do Electron e exposta, mantendo o isolamento.
// -----------------------------------------------------------------------------
contextBridge.exposeInMainWorld('stressflow', api)
