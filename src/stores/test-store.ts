/**
 * Store principal da aplicação (Zustand).
 * ========================================
 *
 * O QUE E ESTE ARQUIVO?
 * ---------------------
 * Este arquivo e o "cerebro" da aplicação StressFlow. Ele guarda todos os
 * dados importantes que a interface precisa exibir ao usuário, como:
 *   - Qual tela esta sendo exibida (navegação)
 *   - A configuração do teste de estresse (parâmetros)
 *   - Se o teste esta rodando ou parado (execução)
 *   - O progresso do teste em tempo real (métricas ao vivo)
 *   - Os resultados dos testes ja realizados (histórico)
 *   - Mensagens de erro (comunicação de problemas)
 *
 * COMO FUNCIONA?
 * --------------
 * Usamos uma biblioteca chamada Zustand (palavra alema para "estado").
 * Ela funciona como um "quadro de avisos" central:
 *   - Qualquer parte da interface pode LER os dados daqui
 *   - Qualquer parte da interface pode ALTERAR os dados usando as acoes
 *   - Quando algo muda, as telas que usam aquele dado se atualizam sozinhas
 *
 * COMO USAR NOS COMPONENTES?
 * --------------------------
 *   // Lendo um dado:
 *   const config = useTestStore((s) => s.config)
 *
 *   // Chamando uma acao:
 *   const setStatus = useTestStore((s) => s.setStatus)
 *   setStatus('running')
 *
 * DICA DE PERFORMANCE:
 *   Selecione apenas o que o componente precisa.
 *   Evite fazer `useTestStore()` sem seletor, pois isso causa
 *   re-renderizacoes desnecessarias a cada mudanca no store.
 *
 * ORGANIZACAO DESTE ARQUIVO:
 *   1. Tipos internos   - formato dos dados e acoes disponiveis
 *   2. Valores iniciais - estado padrão ao abrir a aplicação
 *   3. Criacao do store - implementacao das acoes
 */

import { create } from "zustand";
import type {
  TestConfig,
  TestResult,
  ProgressData,
  AppView,
  TestStatus,
  SecondMetrics,
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
  // -- Navegação: controla qual tela o usuário esta vendo ------------------

  /** Tela ativa: 'test' (formulario), 'history' (histórico) ou 'results'. */
  view: AppView;

  // -- Configuração: parâmetros definidos pelo usuário antes do teste ------

  /** Parâmetros do teste (URL, usuários virtuais, duração, método HTTP). */
  config: TestConfig;

  // -- Execução: indica o que esta acontecendo agora ----------------------

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

  // -- Histórico: todos os testes ja realizados ----------------------------

  /** Lista de resultados salvos, ordenados do mais recente ao mais antigo. */
  history: TestResult[];

  // -- Erros: comunicação de problemas ao usuário -------------------------

  /** Mensagem de erro exibida ao usuário (null = nenhum erro ativo). */
  error: string | null;
}

/**
 * Acoes disponiveis para alterar o estado.
 *
 * Estas são as "operações" que os componentes podem executar para
 * modificar os dados do store. Nenhum componente altera os dados
 * diretamente; ele sempre chama uma destas acoes.
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
}

/**
 * Contrato completo do store: dados + acoes.
 *
 * Esta interface combina os dados (TestState) com as acoes (TestActions),
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
 * durante o uso, utilize a acao `updateConfig` do store.
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
};

// ---------------------------------------------------------------------------
// 3. Criacao do store
// ---------------------------------------------------------------------------

/**
 * Hook principal do estado global do StressFlow.
 *
 * Este e o ponto de acesso único para todo o estado da aplicação.
 * Use-o nos componentes React para ler dados e executar acoes.
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
 * // Lendo multiplos valores (use selecoes separadas para melhor performance):
 * const status = useTestStore((s) => s.status)
 * const progress = useTestStore((s) => s.progress)
 */
export const useTestStore = create<TestStore>((set) => ({
  // =========================================================================
  // Dados iniciais (estado "zerado" da aplicação)
  // =========================================================================

  ...ESTADO_INICIAL,

  // =========================================================================
  // Acoes de navegação
  // =========================================================================

  setView: (view) => set({ view }),

  // =========================================================================
  // Acoes de configuração do teste
  // =========================================================================

  updateConfig: (partial) =>
    set((state) => ({
      config: { ...state.config, ...partial },
    })),

  // =========================================================================
  // Acoes de status de execução
  // =========================================================================

  setStatus: (status) => set({ status }),

  // =========================================================================
  // Acoes de progresso em tempo real
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
  // Acoes de resultado atual
  // =========================================================================

  setCurrentResult: (result) => set({ currentResult: result }),

  // =========================================================================
  // Acoes de histórico de testes
  // =========================================================================

  setHistory: (history) => set({ history }),

  addToHistory: (result) =>
    set((state) => ({
      history: [result, ...state.history],
    })),

  // =========================================================================
  // Acoes de tratamento de erros
  // =========================================================================

  setError: (error) => set({ error }),
}));
