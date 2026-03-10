/**
 * Store principal da aplicacao (Zustand).
 * ========================================
 *
 * O QUE E ESTE ARQUIVO?
 * ---------------------
 * Este arquivo e o "cerebro" da aplicacao StressFlow. Ele guarda todos os
 * dados importantes que a interface precisa exibir ao usuario, como:
 *   - Qual tela esta sendo exibida (navegacao)
 *   - A configuracao do teste de estresse (parametros)
 *   - Se o teste esta rodando ou parado (execucao)
 *   - O progresso do teste em tempo real (metricas ao vivo)
 *   - Os resultados dos testes ja realizados (historico)
 *   - Mensagens de erro (comunicacao de problemas)
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
 *   2. Valores iniciais - estado padrao ao abrir a aplicacao
 *   3. Criacao do store - implementacao das acoes
 */

import { create } from 'zustand'
import type {
  TestConfig,
  TestResult,
  ProgressData,
  AppView,
  TestStatus,
  SecondMetrics,
} from '@/types'

// ---------------------------------------------------------------------------
// 1. Tipos internos do store
// ---------------------------------------------------------------------------

/**
 * Dados armazenados no store (a "memoria" da aplicacao).
 *
 * Estes sao os campos que guardam informacoes. Pense neles como as
 * "colunas" de uma planilha que a interface consulta para saber o
 * que exibir na tela.
 */
interface TestState {
  // -- Navegacao: controla qual tela o usuario esta vendo ------------------

  /** Tela ativa: 'test' (formulario), 'history' (historico) ou 'results'. */
  view: AppView

  // -- Configuracao: parametros definidos pelo usuario antes do teste ------

  /** Parametros do teste (URL, usuarios virtuais, duracao, metodo HTTP). */
  config: TestConfig

  // -- Execucao: indica o que esta acontecendo agora ----------------------

  /**
   * Status atual do teste:
   *   - 'idle': parado, aguardando o usuario iniciar
   *   - 'running': teste em andamento
   *   - 'completed': teste finalizado com sucesso
   *   - 'cancelled': teste cancelado pelo usuario
   *   - 'error': teste encerrado por falha
   */
  status: TestStatus

  // -- Progresso: dados em tempo real durante o teste ---------------------

  /** Metricas do segundo atual (null quando nao ha teste em andamento). */
  progress: ProgressData | null

  /**
   * Historico segundo-a-segundo acumulado durante a execucao.
   * Cada entrada contem as metricas de um segundo especifico do teste.
   * Usado para gerar graficos de evolucao em tempo real.
   */
  timeline: SecondMetrics[]

  // -- Resultado: dados do ultimo teste executado -------------------------

  /** Resultado completo do ultimo teste (null se nenhum teste foi feito). */
  currentResult: TestResult | null

  // -- Historico: todos os testes ja realizados ----------------------------

  /** Lista de resultados salvos, ordenados do mais recente ao mais antigo. */
  history: TestResult[]

  // -- Erros: comunicacao de problemas ao usuario -------------------------

  /** Mensagem de erro exibida ao usuario (null = nenhum erro ativo). */
  error: string | null
}

/**
 * Acoes disponiveis para alterar o estado.
 *
 * Estas sao as "operacoes" que os componentes podem executar para
 * modificar os dados do store. Nenhum componente altera os dados
 * diretamente; ele sempre chama uma destas acoes.
 */
interface TestActions {
  // -- Navegacao -----------------------------------------------------------

  /** Troca a tela exibida na interface. */
  setView: (view: AppView) => void

  // -- Configuracao --------------------------------------------------------

  /**
   * Atualiza a configuracao do teste.
   * Recebe apenas os campos que devem mudar; os demais sao mantidos.
   * Exemplo: updateConfig({ url: 'https://meusite.com' })
   */
  updateConfig: (partial: Partial<TestConfig>) => void

  // -- Execucao ------------------------------------------------------------

  /** Define o novo status da execucao do teste. */
  setStatus: (status: TestStatus) => void

  // -- Progresso -----------------------------------------------------------

  /**
   * Registra os dados de um novo segundo do teste.
   * Atualiza o progresso atual e adiciona as metricas ao timeline.
   */
  setProgress: (data: ProgressData) => void

  /** Limpa progresso e timeline (usado ao iniciar ou encerrar um teste). */
  clearProgress: () => void

  // -- Resultado -----------------------------------------------------------

  /** Define ou limpa o resultado atual. Passe null para limpar. */
  setCurrentResult: (result: TestResult | null) => void

  // -- Historico -----------------------------------------------------------

  /** Substitui o historico inteiro (usado ao carregar dados salvos do disco). */
  setHistory: (history: TestResult[]) => void

  /** Adiciona um resultado ao inicio do historico (posicao mais recente). */
  addToHistory: (result: TestResult) => void

  /** Remove um resultado do historico pelo seu identificador unico (UUID). */
  removeFromHistory: (id: string) => void

  // -- Erros ---------------------------------------------------------------

  /** Define ou limpa a mensagem de erro. Passe null para limpar o erro. */
  setError: (error: string | null) => void
}

/**
 * Contrato completo do store: dados + acoes.
 *
 * Esta interface combina os dados (TestState) com as acoes (TestActions),
 * formando o formato completo do estado global da aplicacao.
 */
type TestStore = TestState & TestActions

// ---------------------------------------------------------------------------
// 2. Valores iniciais
// ---------------------------------------------------------------------------

/**
 * Configuracao padrao usada quando o usuario ainda nao alterou nada.
 *
 * - URL vazia: obriga o usuario a preencher antes de iniciar
 * - 100 usuarios virtuais: quantidade segura para um primeiro teste
 * - 30 segundos: duracao curta para ser rapida, mas longa o suficiente
 *   para gerar dados significativos
 * - Metodo GET: o mais comum e seguro para testes de carga iniciais
 *
 * NOTA: Este objeto e congelado (Object.freeze) para evitar que qualquer
 * parte do codigo o altere acidentalmente. Para mudar a configuracao
 * durante o uso, utilize a acao `updateConfig` do store.
 */
const CONFIG_PADRAO: Readonly<TestConfig> = Object.freeze({
  url: '',
  virtualUsers: 100,
  duration: 30,
  method: 'GET',
})

/**
 * Estado inicial completo do store.
 *
 * Representa a aplicacao no momento em que o usuario acabou de abri-la:
 * nenhum teste rodando, nenhum resultado, nenhuma configuracao personalizada.
 * Centralizar estes valores aqui facilita futuras funcionalidades como
 * "resetar tudo para o estado original".
 */
const ESTADO_INICIAL: TestState = {
  view: 'test',
  config: { ...CONFIG_PADRAO },
  status: 'idle',
  progress: null,
  timeline: [],
  currentResult: null,
  history: [],
  error: null,
}

// ---------------------------------------------------------------------------
// 3. Criacao do store
// ---------------------------------------------------------------------------

/**
 * Hook principal do estado global do StressFlow.
 *
 * Este e o ponto de acesso unico para todo o estado da aplicacao.
 * Use-o nos componentes React para ler dados e executar acoes.
 *
 * @example
 * // Lendo a configuracao atual:
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
  // Dados iniciais (estado "zerado" da aplicacao)
  // =========================================================================

  ...ESTADO_INICIAL,

  // =========================================================================
  // Acoes de navegacao
  // =========================================================================

  setView: (view) => set({ view }),

  // =========================================================================
  // Acoes de configuracao do teste
  // =========================================================================

  updateConfig: (partial) =>
    set((state) => ({
      config: { ...state.config, ...partial },
    })),

  // =========================================================================
  // Acoes de status de execucao
  // =========================================================================

  setStatus: (status) => set({ status }),

  // =========================================================================
  // Acoes de progresso em tempo real
  // =========================================================================

  // Otimizacao: usar concat ao inves de spread para append em arrays grandes.
  // O spread [...arr, item] cria uma copia intermediaria para cada atualizacao,
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
  // Acoes de historico de testes
  // =========================================================================

  setHistory: (history) => set({ history }),

  addToHistory: (result) =>
    set((state) => ({
      history: [result, ...state.history],
    })),

  removeFromHistory: (id) =>
    set((state) => ({
      history: state.history.filter((entry) => entry.id !== id),
    })),

  // =========================================================================
  // Acoes de tratamento de erros
  // =========================================================================

  setError: (error) => set({ error }),
}))
