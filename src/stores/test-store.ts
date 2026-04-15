/**
 * Store principal da aplicação (Zustand).
 * ========================================
 *
 * O QUE E ESTE ARQUIVO?
 * ---------------------
 * Este arquivo e o "cerebro" da aplicação CPX-Stress. Ele guarda todos os
 * dados importantes que a interface precisa exibir ao usuário, como:
 *   - Qual tela está sendo exibida (navegação)
 *   - A configuração do teste de estresse (parâmetros)
 *   - Se o teste está rodando ou parado (execução)
 *   - O progresso do teste em tempo real (métricas ao vivo)
 *   - Os resultados dos testes já realizados (histórico)
 *   - Mensagens de erro (comunicação de problemas)
 *
 * COMO FUNCIONA?
 * --------------
 * Usamos uma biblioteca chamada Zustand (palavra alema para "estado").
 * Ela funciona como um "quadro de avisos" central:
 *   - Qualquer parte da interface pode LER os dados daqui
 *   - Qualquer parte da interface pode ALTERAR os dados usando as ações
 *   - Quando algo muda, as telas que usam aquele dado se atualizam sozinhas
 *
 * COMO USAR NOS COMPONENTES?
 * --------------------------
 *   // Lendo um dado:
 *   const config = useTestStore((s) => s.config)
 *
 *   // Chamando uma ação:
 *   const setStatus = useTestStore((s) => s.setStatus)
 *   setStatus('running')
 *
 * DICA DE PERFORMANCE:
 *   Selecione apenas o que o componente precisa.
 *   Evite fazer `useTestStore()` sem seletor, pois isso causa
 *   re-renderizacoes desnecessarias a cada mudanca no store.
 *
 * ORGANIZACAO DESTE ARQUIVO:
 *   1. Tipos internos   - formato dos dados e ações disponiveis
 *   2. Valores iniciais - estado padrão ao abrir a aplicação
 *   3. Criacao do store - implementacao das ações
 */

import { create } from "zustand";
import type {
  TestConfig,
  TestResult,
  ProgressData,
  AppView,
  TestStatus,
  SecondMetrics,
  CredentialStatus,
  TestPreset,
  ActivePresetInfo,
  TestOperation,
  ExternalBenchmarkEngine,
  ExternalBenchmarkStatus,
  ExternalBenchmarksState,
  ArtillerySummary,
  JMeterSummary,
  K6Summary,
  LocustSummary,
} from "@/types";
import {
  buildMistertOperations,
  MISTERT_DEFAULT_BASE_URL,
} from "@/constants/test-presets";

// ---------------------------------------------------------------------------
// 1. Tipos internos do store
// ---------------------------------------------------------------------------

/**
 * Dados armazenados no store (a "memória" da aplicação).
 *
 * Estes são os campos que guardam informações. Pense neles como as
 * "colunas" de uma planilha que a interface consulta para saber o
 * que exibir na tela.
 */
interface TestState {
  // -- Navegação: controla qual tela o usuário está vendo ------------------

  /** Tela ativa: 'test' (formulario), 'history' (histórico) ou 'results'. */
  view: AppView;

  // -- Configuração: parâmetros definidos pelo usuário antes do teste ------

  /** Parâmetros do teste (URL, usuários virtuais, duração, método HTTP). */
  config: TestConfig;

  // -- Execução: indica o que está acontecendo agora ----------------------

  /**
   * Status atual do teste:
   *   - 'idle': parado, aguardando o usuário iniciar
   *   - 'running': teste em andamento
   *   - 'completed': teste finalizado com sucesso
   *   - 'cancelled': teste cancelado pelo usuário
   *   - 'error': teste encerrado por falha
   */
  status: TestStatus;

  // -- Progresso: dados em tempo real durante o teste ---------------------

  /** Métricas do segundo atual (null quando não ha teste em andamento). */
  progress: ProgressData | null;

  /**
   * Histórico segundo-a-segundo acumulado durante a execução.
   * Cada entrada contém as métricas de um segundo específico do teste.
   * Usado para gerar gráficos de evolucao em tempo real.
   */
  timeline: SecondMetrics[];

  // -- Resultado: dados do último teste executado -------------------------

  /** Resultado completo do último teste (null se nenhum teste foi feito). */
  currentResult: TestResult | null;

  // -- Histórico: todos os testes já realizados ----------------------------

  /** Lista de resultados salvos, ordenados do mais recente ao mais antigo. */
  history: TestResult[];

  // -- Erros: comunicação de problemas ao usuário -------------------------

  /** Mensagem de erro exibida ao usuário (null = nenhum erro ativo). */
  error: string | null;

  // -- Credenciais: status de configuração das credenciais MisterT --------

  /**
   * Status das credenciais obrigatorias (null = ainda não verificado no startup).
   * Contém apenas booleanos indicando se cada credencial está configurada.
   * Os valores reais NUNCA são armazenados no store.
   */
  credentialStatus: CredentialStatus | null;

  // -- Presets: configurações de teste salvas para reutilizacao ---------------

  /**
   * Preset atualmente carregado no formulario (null = nenhum).
   * Limpo automaticamente quando o usuário altera a configuração manualmente.
   */
  activePreset: ActivePresetInfo | null;

  /** Lista de presets carregados do banco (built-in + usuário). */
  presets: TestPreset[];

  /** Estado compartilhado dos benchmarks externos executados em paralelo. */
  benchmarks: ExternalBenchmarksState;
}

/**
 * Ações disponiveis para alterar o estado.
 *
 * Estas são as "operações" que os componentes podem executar para
 * modificar os dados do store. Nenhum componente altera os dados
 * diretamente; ele sempre chama uma destas ações.
 */
interface TestActions {
  // -- Navegação -----------------------------------------------------------

  /** Troca a tela exibida na interface. */
  setView: (view: AppView) => void;

  // -- Configuração --------------------------------------------------------

  /**
   * Atualiza a configuração do teste.
   * Recebe apenas os campos que devem mudar; os demais são mantidos.
   * Exemplo: updateConfig({ url: 'https://meusite.com' })
   */
  updateConfig: (partial: Partial<TestConfig>) => void;

  // -- Execução ------------------------------------------------------------

  /** Define o novo status da execução do teste. */
  setStatus: (status: TestStatus) => void;

  // -- Progresso -----------------------------------------------------------

  /**
   * Registra os dados de um novo segundo do teste.
   * Atualiza o progresso atual e adiciona as métricas ao timeline.
   */
  setProgress: (data: ProgressData) => void;

  /** Limpa progresso e timeline (usado ao iniciar ou encerrar um teste). */
  clearProgress: () => void;

  // -- Resultado -----------------------------------------------------------

  /** Define ou limpa o resultado atual. Passe null para limpar. */
  setCurrentResult: (result: TestResult | null) => void;

  // -- Histórico -----------------------------------------------------------

  /** Substitui o histórico inteiro (usado ao carregar dados salvos do disco). */
  setHistory: (history: TestResult[]) => void;

  /** Adiciona um resultado ao início do histórico (posição mais recente). */
  addToHistory: (result: TestResult) => void;

  // -- Erros ---------------------------------------------------------------

  /** Define ou limpa a mensagem de erro. Passe null para limpar o erro. */
  setError: (error: string | null) => void;

  // -- Credenciais --------------------------------------------------------

  /** Atualiza o status booleano das credenciais no store. */
  setCredentialStatus: (status: CredentialStatus | null) => void;

  // -- Presets ---------------------------------------------------------------

  /**
   * Aplica um preset: define a configuração e marca como preset ativo.
   * Usa set() atomico para evitar flash de estado inconsistente.
   */
  applyPreset: (config: TestConfig, presetInfo: ActivePresetInfo) => void;

  /** Substitui a lista de presets carregados do banco. */
  setPresets: (presets: TestPreset[]) => void;

  /** Limpa o preset ativo (chamado quando o usuário altera a config manualmente). */
  clearActivePreset: () => void;

  /**
   * Atualiza as operações do teste sem limpar o preset ativo.
   * Usado pelo seletor de módulos para personalizar o fluxo MisterT
   * sem perder a referência ao preset carregado (D4).
   *
   * Atualiza config.operations e config.url (primeira operação).
   * NÃO zera activePreset — diferente de updateConfig que sempre zera.
   */
  updateModuleSelection: (operations: TestOperation[]) => void;

  // -- Benchmarks externos ----------------------------------------------------

  setBenchmarkRun: (runKey: string | null) => void;
  markBenchmarksStarted: () => void;
  setBenchmarkAvailable: (
    engine: ExternalBenchmarkEngine,
    available: boolean | null,
  ) => void;
  setBenchmarkStatus: (
    engine: ExternalBenchmarkEngine,
    status: ExternalBenchmarkStatus,
  ) => void;
  appendBenchmarkProgress: (
    engine: ExternalBenchmarkEngine,
    line: string,
  ) => void;
  setBenchmarkError: (
    engine: ExternalBenchmarkEngine,
    error: string | null,
  ) => void;
  setBenchmarkSummary: (
    engine: ExternalBenchmarkEngine,
    summary:
      | K6Summary
      | LocustSummary
      | ArtillerySummary
      | JMeterSummary
      | null,
  ) => void;
  resetBenchmarkEngine: (engine: ExternalBenchmarkEngine) => void;
}

/**
 * Contrato completo do store: dados + ações.
 *
 * Está interface combina os dados (TestState) com as ações (TestActions),
 * formando o formato completo do estado global da aplicação.
 */
type TestStore = TestState & TestActions;

// ---------------------------------------------------------------------------
// 2. Valores iniciais
// ---------------------------------------------------------------------------

/**
 * Configuração padrão usada quando o usuário ainda não alterou nada.
 *
 * - URL vazia: obriga o usuário a preencher antes de iniciar
 * - 100 usuários virtuais: quantidade segura para um primeiro teste
 * - 30 segundos: duração curta para ser rapida, mas longa o suficiente
 *   para gerar dados significativos
 * - Método GET: o mais comum e seguro para testes de carga iniciais
 *
 * NOTA: Este objeto e congelado (Object.freeze) para evitar que qualquer
 * parte do código o altere acidentalmente. Para mudar a configuração
 * durante o uso, utilize a ação `updateConfig` do store.
 */
const CONFIG_PADRAO: Readonly<TestConfig> = Object.freeze({
  url: MISTERT_DEFAULT_BASE_URL + "/MisterT.asp?MF=Y",
  virtualUsers: 150,
  duration: 60,
  method: "GET",
  operations: buildMistertOperations(),
});

/**
 * Estado inicial completo do store.
 *
 * Representa a aplicação no momento em que o usuário acabou de abri-la:
 * nenhum teste rodando, nenhum resultado, nenhuma configuração personalizada.
 * Centralizar estes valores aqui facilita futuras funcionalidades como
 * "resetar tudo para o estado original".
 */
const ESTADO_INICIAL: TestState = {
  view: "test",
  config: { ...CONFIG_PADRAO },
  status: "idle",
  progress: null,
  timeline: [],
  currentResult: null,
  history: [],
  error: null,
  credentialStatus: null,
  activePreset: null,
  presets: [],
  benchmarks: {
    runKey: null,
    started: false,
    k6: {
      available: null,
      status: "idle",
      error: null,
      progress: [],
      summary: null,
    },
    locust: {
      available: null,
      status: "idle",
      error: null,
      progress: [],
      summary: null,
    },
    artillery: {
      available: null,
      status: "idle",
      error: null,
      progress: [],
      summary: null,
    },
    jmeter: {
      available: null,
      status: "idle",
      error: null,
      progress: [],
      summary: null,
    },
  },
};

// ---------------------------------------------------------------------------
// 3. Criacao do store
// ---------------------------------------------------------------------------

/**
 * Hook principal do estado global do CPX-Stress.
 *
 * Este e o ponto de acesso único para todo o estado da aplicação.
 * Use-o nos componentes React para ler dados e executar ações.
 *
 * @example
 * // Lendo a configuração atual:
 * const config = useTestStore((s) => s.config)
 *
 * @example
 * // Alterando o status do teste:
 * const setStatus = useTestStore((s) => s.setStatus)
 * setStatus('running')
 *
 * @example
 * // Lendo multiplos valores (use seleções separadas para melhor performance):
 * const status = useTestStore((s) => s.status)
 * const progress = useTestStore((s) => s.progress)
 */
export const useTestStore = create<TestStore>((set) => ({
  // =========================================================================
  // Dados iniciais (estado "zerado" da aplicação)
  // =========================================================================

  ...ESTADO_INICIAL,

  // =========================================================================
  // Ações de navegação
  // =========================================================================

  setView: (view) => set({ view }),

  // =========================================================================
  // Ações de configuração do teste
  // =========================================================================

  updateConfig: (partial) =>
    set((state) => ({
      config: { ...state.config, ...partial },
      activePreset: null,
    })),

  // =========================================================================
  // Ações de status de execução
  // =========================================================================

  setStatus: (status) => set({ status }),

  // =========================================================================
  // Ações de progresso em tempo real
  // =========================================================================

  // Otimizacao: usar concat ao inves de spread para append em arrays grandes.
  // O spread [...arr, item] cria uma copia intermediaria para cada atualização,
  // enquanto concat e otimizado internamente pelo motor JS para append simples.
  // Em testes longos (ex: 300s), isso evita copiar centenas de objetos a cada segundo.
  setProgress: (data) =>
    set((state) => ({
      progress: data,
      timeline: state.timeline.concat(data.metrics),
    })),

  clearProgress: () =>
    set({
      progress: null,
      timeline: [],
    }),

  // =========================================================================
  // Ações de resultado atual
  // =========================================================================

  setCurrentResult: (result) => set({ currentResult: result }),

  // =========================================================================
  // Ações de histórico de testes
  // =========================================================================

  setHistory: (history) => set({ history }),

  addToHistory: (result) =>
    set((state) => ({
      history: [result, ...state.history],
    })),

  // =========================================================================
  // Ações de tratamento de erros
  // =========================================================================

  setError: (error) => set({ error }),

  // =========================================================================
  // Ações de credenciais
  // =========================================================================

  setCredentialStatus: (status) => set({ credentialStatus: status }),

  // =========================================================================
  // Ações de presets
  // =========================================================================

  applyPreset: (config, presetInfo) =>
    set({
      config: { ...config },
      activePreset: presetInfo,
    }),

  setPresets: (presets) => set({ presets }),

  clearActivePreset: () => set({ activePreset: null }),

  updateModuleSelection: (operations) =>
    set((state) => ({
      config: {
        ...state.config,
        operations,
        url: operations[0]?.url ?? state.config.url,
      },
      // activePreset NÃO é zerado — seleção de módulo é personalização temporária
      // do preset ativo para um teste específico (D4 de 04-CONTEXT.md)
    })),

  setBenchmarkRun: (runKey) =>
    set((state) => ({
      benchmarks: {
        runKey,
        started: false,
        k6: {
          ...state.benchmarks.k6,
          error: null,
          progress: [],
          summary: null,
          status: "idle",
        },
        locust: {
          ...state.benchmarks.locust,
          error: null,
          progress: [],
          summary: null,
          status: "idle",
        },
        artillery: {
          ...state.benchmarks.artillery,
          error: null,
          progress: [],
          summary: null,
          status: "idle",
        },
        jmeter: {
          ...state.benchmarks.jmeter,
          error: null,
          progress: [],
          summary: null,
          status: "idle",
        },
      },
    })),

  markBenchmarksStarted: () =>
    set((state) => ({
      benchmarks: {
        ...state.benchmarks,
        started: true,
      },
    })),

  setBenchmarkAvailable: (engine, available) =>
    set((state) => ({
      benchmarks: {
        ...state.benchmarks,
        [engine]: {
          ...state.benchmarks[engine],
          available,
        },
      },
    })),

  setBenchmarkStatus: (engine, status) =>
    set((state) => ({
      benchmarks: {
        ...state.benchmarks,
        [engine]: {
          ...state.benchmarks[engine],
          status,
        },
      },
    })),

  appendBenchmarkProgress: (engine, line) =>
    set((state) => ({
      benchmarks: {
        ...state.benchmarks,
        [engine]: {
          ...state.benchmarks[engine],
          progress: [...state.benchmarks[engine].progress.slice(-199), line],
        },
      },
    })),

  setBenchmarkError: (engine, error) =>
    set((state) => ({
      benchmarks: {
        ...state.benchmarks,
        [engine]: {
          ...state.benchmarks[engine],
          error,
        },
      },
    })),

  setBenchmarkSummary: (engine, summary) =>
    set((state) => ({
      benchmarks: {
        ...state.benchmarks,
        [engine]: {
          ...state.benchmarks[engine],
          summary,
        },
      },
    })),

  resetBenchmarkEngine: (engine) =>
    set((state) => ({
      benchmarks: {
        ...state.benchmarks,
        [engine]: {
          ...state.benchmarks[engine],
          error: null,
          progress: [],
          summary: null,
          status: "idle",
        },
      },
    })),
}));
