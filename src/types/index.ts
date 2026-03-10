// ============================================================================
// StressFlow - Definicoes de Tipos
// ============================================================================
//
// Este arquivo contem todas as definicoes de tipos usadas no StressFlow.
// Cada tipo descreve a "forma" dos dados que circulam pela aplicacao.
//
// Organizacao:
//   1. Configuracao do Teste
//   2. Metricas e Progresso
//   3. Resultado do Teste
//   4. Motor de Deteccao de Protecao
//   5. Estado da Aplicacao
//   6. API Global (Electron)
// ============================================================================


// ============================================================================
// 1. CONFIGURACAO DO TESTE
// ----------------------------------------------------------------------------
// Define os parametros que o usuario escolhe antes de iniciar um teste de
// estresse. Pense nisso como o "formulario" que o usuario preenche.
// ============================================================================

/** Metodos HTTP suportados para o teste (tipo de requisicao ao servidor). */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

/**
 * Configuracao do teste de estresse.
 *
 * Contem todos os parametros que o usuario define antes de rodar o teste,
 * como a URL alvo, numero de usuarios simulados e duracao.
 */
export interface TestConfig {
  /** URL do servidor que sera testado (ex: "https://meusite.com.br/api"). */
  url: string

  /**
   * Quantidade de usuarios virtuais (simultaneos) simulados.
   * Cada usuario virtual envia requisicoes de forma independente,
   * como se fossem pessoas reais acessando o site ao mesmo tempo.
   */
  virtualUsers: number

  /** Duracao total do teste em segundos. */
  duration: number

  /**
   * Metodo HTTP da requisicao.
   * - GET: buscar dados (mais comum)
   * - POST: enviar dados novos
   * - PUT: atualizar dados existentes
   * - DELETE: remover dados
   */
  method: HttpMethod

  /**
   * Cabecalhos HTTP adicionais (opcional).
   * Usados para enviar informacoes extras, como tokens de autenticacao.
   * Exemplo: { "Authorization": "Bearer abc123" }
   */
  headers?: Record<string, string>

  /**
   * Corpo da requisicao em texto (opcional).
   * Usado em requisicoes POST e PUT para enviar dados ao servidor,
   * geralmente em formato JSON.
   */
  body?: string

  /**
   * Tempo de rampa em segundos (opcional).
   * Ao inves de iniciar todos os usuarios de uma vez, eles sao adicionados
   * gradualmente durante esse periodo. Isso simula um crescimento natural
   * de trafego, evitando um "choque" inicial no servidor.
   */
  rampUp?: number
}


// ============================================================================
// 2. METRICAS E PROGRESSO
// ----------------------------------------------------------------------------
// Dados coletados durante a execucao do teste. A cada segundo, o sistema
// registra metricas como quantidade de requisicoes, erros e tempos de resposta.
// ============================================================================

/**
 * Metricas coletadas em um unico segundo do teste.
 *
 * A cada segundo, o sistema tira uma "fotografia" do desempenho do servidor,
 * registrando quantas requisicoes foram feitas, quantas falharam,
 * e o quao rapido o servidor respondeu.
 */
export interface SecondMetrics {
  /** Momento exato da medicao em milissegundos (timestamp Unix). */
  timestamp: number

  /** Numero do segundo dentro do teste (1, 2, 3...). */
  second: number

  /** Total de requisicoes completadas neste segundo. */
  requests: number

  /** Total de requisicoes que falharam neste segundo. */
  errors: number

  /**
   * Tempo medio de resposta (latencia) em milissegundos.
   * Quanto menor, mais rapido o servidor respondeu.
   */
  latencyAvg: number

  /**
   * Percentil 50 (mediana) da latencia em ms.
   * Metade das requisicoes foram mais rapidas que esse valor.
   */
  latencyP50: number

  /**
   * Percentil 90 da latencia em ms.
   * 90% das requisicoes foram mais rapidas que esse valor.
   * Util para entender a experiencia da maioria dos usuarios.
   */
  latencyP90: number

  /**
   * Percentil 95 da latencia em ms.
   * Apenas 5% das requisicoes foram mais lentas que isso.
   */
  latencyP95: number

  /**
   * Percentil 99 da latencia em ms.
   * Apenas 1% das requisicoes foram mais lentas que isso.
   * Mostra os piores casos de desempenho.
   */
  latencyP99: number

  /** Maior tempo de resposta registrado neste segundo (ms). */
  latencyMax: number

  /** Menor tempo de resposta registrado neste segundo (ms). */
  latencyMin: number

  /**
   * Contagem de respostas por codigo de status HTTP.
   * Exemplo: { "200": 95, "500": 5 } indica 95 sucessos e 5 erros internos.
   *
   * Codigos comuns:
   * - 200: Sucesso
   * - 301/302: Redirecionamento
   * - 403: Acesso negado
   * - 429: Muitas requisicoes (rate limit)
   * - 500: Erro interno do servidor
   * - 503: Servidor indisponivel
   */
  statusCodes: Record<string, number>

  /** Total de bytes (dados) recebidos do servidor neste segundo. */
  bytesReceived: number

  /** Numero de usuarios virtuais ativos neste segundo. */
  activeUsers: number
}

/**
 * Dados de progresso do teste em tempo real.
 *
 * Enviado a cada segundo para a interface, permitindo que o usuario
 * acompanhe a evolucao do teste enquanto ele acontece.
 */
export interface ProgressData {
  /** Segundo atual do teste (ex: 15 de 30). */
  currentSecond: number

  /** Duracao total planejada do teste em segundos. */
  totalSeconds: number

  /** Metricas detalhadas do segundo atual. */
  metrics: SecondMetrics

  /**
   * Metricas acumuladas desde o inicio do teste.
   * Diferente das metricas por segundo, estas somam tudo ate o momento.
   */
  cumulative: {
    /** Total de requisicoes feitas desde o inicio do teste. */
    totalRequests: number

    /** Total de erros desde o inicio do teste. */
    totalErrors: number

    /** Requisicoes por segundo (media acumulada). */
    rps: number
  }
}


// ============================================================================
// 3. RESULTADO DO TESTE
// ----------------------------------------------------------------------------
// Resumo completo gerado apos a finalizacao de um teste. Contem todas as
// metricas consolidadas, a linha do tempo completa e o relatorio de protecao.
// ============================================================================

/**
 * Status final de um teste: se terminou com sucesso, foi cancelado
 * pelo usuario ou ocorreu um erro inesperado.
 */
export type TestResultStatus = 'completed' | 'cancelled' | 'error'

/**
 * Resultado completo de um teste de estresse.
 *
 * Contem o resumo final com todas as metricas consolidadas, incluindo
 * velocidade media de resposta, taxa de erros, e a linha do tempo
 * completa segundo a segundo. E o "relatorio final" do teste.
 */
export interface TestResult {
  /** Identificador unico do teste (UUID gerado automaticamente). */
  id: string

  /** URL que foi testada. */
  url: string

  /** Configuracao usada para rodar este teste. */
  config: TestConfig

  /** Data/hora de inicio do teste (formato ISO 8601). */
  startTime: string

  /** Data/hora de termino do teste (formato ISO 8601). */
  endTime: string

  /** Duracao real do teste em segundos (pode diferir se foi cancelado). */
  durationSeconds: number

  /** Numero total de requisicoes enviadas durante o teste. */
  totalRequests: number

  /** Numero total de requisicoes que falharam. */
  totalErrors: number

  /**
   * Requisicoes por segundo (RPS) - taxa media de vazao.
   * Indica quantas requisicoes o servidor conseguiu processar por segundo.
   * Quanto maior, melhor o desempenho.
   */
  rps: number

  /**
   * Estatisticas de latencia (tempo de resposta) consolidadas.
   * Todos os valores sao em milissegundos (ms).
   */
  latency: {
    /** Tempo medio de resposta. */
    avg: number

    /** Tempo de resposta mais rapido registrado. */
    min: number

    /** Mediana: metade das respostas foram mais rapidas que isso. */
    p50: number

    /** 90% das respostas foram mais rapidas que isso. */
    p90: number

    /** 95% das respostas foram mais rapidas que isso. */
    p95: number

    /** 99% das respostas foram mais rapidas que isso. */
    p99: number

    /** Tempo de resposta mais lento registrado. */
    max: number
  }

  /**
   * Taxa de erros em porcentagem (0 a 100).
   * Exemplo: 2.5 significa que 2,5% das requisicoes falharam.
   */
  errorRate: number

  /**
   * Vazao de dados em bytes por segundo.
   * Indica o volume de dados transferidos por segundo.
   */
  throughputBytesPerSec: number

  /** Total de bytes (dados) recebidos durante todo o teste. */
  totalBytes: number

  /**
   * Contagem total de respostas agrupadas por codigo de status HTTP.
   * Exemplo: { "200": 9500, "429": 300, "500": 200 }
   */
  statusCodes: Record<string, number>

  /**
   * Linha do tempo completa: metricas de cada segundo do teste.
   * Usada para gerar graficos e identificar padroes ao longo do tempo.
   */
  timeline: SecondMetrics[]

  /** Status final do teste (concluido, cancelado ou erro). */
  status: TestResultStatus

  /** Mensagem de erro detalhada, presente apenas se o teste falhou. */
  errorMessage?: string

  /**
   * Relatorio de deteccao de protecoes (opcional).
   * Identifica se o servidor possui WAF, CDN, rate limiting, etc.
   * So e gerado se protecoes foram detectadas.
   */
  protectionReport?: ProtectionReport
}


// ============================================================================
// 4. MOTOR DE DETECCAO DE PROTECAO
// ----------------------------------------------------------------------------
// O StressFlow analisa as respostas do servidor para identificar mecanismos
// de protecao como firewalls (WAF), CDNs, limitadores de taxa e protecoes
// anti-bot. Isso ajuda o usuario a entender por que o servidor pode estar
// bloqueando ou limitando as requisicoes durante o teste.
// ============================================================================

// --- 4.1 Classificacoes e Enumeracoes ---

/**
 * Tipo de protecao detectada no servidor alvo.
 *
 * - 'waf': Firewall de Aplicacao Web - filtra trafego malicioso
 * - 'cdn': Rede de Distribuicao de Conteudo - distribui carga geograficamente
 * - 'rate-limiter': Limitador de taxa - restringe requisicoes por periodo
 * - 'anti-bot': Protecao contra robos automatizados
 * - 'ddos-protection': Protecao contra ataques de negacao de servico
 * - 'captcha': Desafio visual para provar que o visitante e humano
 * - 'unknown': Protecao detectada mas nao identificada
 */
export type ProtectionType =
  | 'waf'
  | 'cdn'
  | 'rate-limiter'
  | 'anti-bot'
  | 'ddos-protection'
  | 'captcha'
  | 'unknown'

/**
 * Fornecedor/empresa responsavel pela protecao detectada.
 *
 * Inclui os principais provedores de seguranca e infraestrutura web:
 * - Cloudflare, Akamai, Fastly: CDNs e WAFs populares
 * - Imperva, Sucuri: Especializados em seguranca web
 * - AWS WAF/CloudFront, Azure Front Door, Google Cloud Armor: Nuvens publicas
 * - DDoS-Guard, StackPath: Protecao contra DDoS
 * - Varnish, Nginx: Servidores proxy/cache
 * - 'custom': Solucao proprietaria da empresa
 * - 'unknown': Nao foi possivel identificar o fornecedor
 */
export type ProtectionProvider =
  | 'cloudflare'
  | 'akamai'
  | 'fastly'
  | 'imperva'
  | 'sucuri'
  | 'aws-waf'
  | 'aws-cloudfront'
  | 'azure-frontdoor'
  | 'google-cloud-armor'
  | 'ddos-guard'
  | 'stackpath'
  | 'varnish'
  | 'nginx'
  | 'custom'
  | 'unknown'

/**
 * Nivel de confianca na deteccao.
 *
 * - 'high': Alta certeza - multiplos indicadores claros confirmam a deteccao
 * - 'medium': Certeza moderada - alguns indicadores sugerem a protecao
 * - 'low': Baixa certeza - poucos indicios, pode ser um falso positivo
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low'

// --- 4.2 Indicadores e Deteccoes ---

/**
 * Um indicador individual que sugere a presenca de uma protecao.
 *
 * Pense nisso como uma "pista" encontrada nas respostas do servidor.
 * Por exemplo, um cabecalho "cf-ray" indica uso de Cloudflare.
 */
export interface ProtectionIndicator {
  /**
   * Onde a pista foi encontrada:
   * - 'header': Nos cabecalhos da resposta HTTP
   * - 'cookie': Nos cookies enviados pelo servidor
   * - 'status-code': No codigo de status da resposta (ex: 403, 429)
   * - 'body': No conteudo/corpo da resposta
   * - 'behavior': No padrao de comportamento do servidor ao longo do tempo
   * - 'timing': Nos tempos de resposta (ex: latencia crescente)
   */
  source: 'header' | 'cookie' | 'status-code' | 'body' | 'behavior' | 'timing'

  /** Nome do indicador (ex: "cf-ray", "x-sucuri-id"). */
  name: string

  /** Valor encontrado (ex: "7a1b2c3d4e-GRU"). */
  value: string

  /** Explicacao legivel do que este indicador significa. */
  detail: string
}

/**
 * Uma deteccao completa de protecao.
 *
 * Agrega todas as pistas (indicadores) que levaram a conclusao de que
 * determinada protecao esta ativa no servidor.
 */
export interface ProtectionDetection {
  /** Tipo de protecao identificada (WAF, CDN, rate limiter, etc.). */
  type: ProtectionType

  /** Fornecedor/empresa responsavel pela protecao. */
  provider: ProtectionProvider

  /**
   * Nivel de confianca numerico da deteccao (0 a 100).
   * Quanto maior, mais certeza temos de que a protecao esta presente.
   */
  confidence: number

  /** Nivel de confianca categorizado (alto, medio ou baixo). */
  confidenceLevel: ConfidenceLevel

  /** Lista de indicadores (pistas) que sustentam esta deteccao. */
  indicators: ProtectionIndicator[]

  /** Descricao resumida da protecao detectada em linguagem acessivel. */
  description: string
}

// --- 4.3 Rate Limiting e Padroes Comportamentais ---

/**
 * Informacoes sobre limitacao de taxa (rate limiting) detectada.
 *
 * Rate limiting e quando o servidor limita quantas requisicoes voce
 * pode fazer em determinado periodo. E como um "caixa de supermercado"
 * que so atende X clientes por minuto.
 */
export interface RateLimitInfo {
  /** Se foi detectado algum tipo de limitacao de taxa. */
  detected: boolean

  /**
   * Segundo do teste em que a limitacao comecou a agir (opcional).
   * Exemplo: se o valor for 15, o servidor comecou a limitar no 15o segundo.
   */
  triggerPoint?: number

  /**
   * Limite de requisicoes por janela de tempo (opcional).
   * Exemplo: "100 requisicoes por janela".
   */
  limitPerWindow?: string

  /**
   * Duracao da janela de tempo em segundos (opcional).
   * Exemplo: 60 significa que o limite se aplica a cada 60 segundos.
   */
  windowSeconds?: number

  /**
   * Padrao de recuperacao observado (opcional).
   * Descreve como o servidor volta ao normal apos aplicar o limite.
   * Exemplo: "Recuperacao gradual apos 30 segundos".
   */
  recoveryPattern?: string
}

/**
 * Padrao de comportamento do servidor observado durante o teste.
 *
 * Descreve como o servidor reagiu ao volume de requisicoes,
 * ajudando a entender suas estrategias de defesa.
 */
export interface BehavioralPattern {
  /**
   * Tipo de comportamento observado:
   * - 'throttling': Servidor desacelerando as respostas intencionalmente
   * - 'blocking': Servidor bloqueando requisicoes completamente
   * - 'challenge': Servidor exigindo verificacao (ex: captcha)
   * - 'degradation': Servidor perdendo desempenho gradualmente
   * - 'normal': Servidor respondendo normalmente, sem sinais de protecao
   */
  type: 'throttling' | 'blocking' | 'challenge' | 'degradation' | 'normal'

  /** Descricao legivel do padrao observado. */
  description: string

  /** Segundo do teste em que o padrao foi observado pela primeira vez. */
  startSecond?: number

  /** Evidencia que sustenta a identificacao deste padrao. */
  evidence: string
}

// --- 4.4 Relatorio Consolidado ---

/**
 * Nivel de risco geral identificado nas protecoes do servidor.
 *
 * Indica o quanto as protecoes detectadas podem impactar o teste:
 * - 'none': Nenhuma protecao detectada
 * - 'low': Protecoes minimas que provavelmente nao afetam o teste
 * - 'medium': Protecoes moderadas que podem afetar parcialmente os resultados
 * - 'high': Protecoes significativas que provavelmente afetam os resultados
 * - 'critical': Protecoes fortes que bloqueiam a maioria das requisicoes
 */
export type OverallRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical'

/**
 * Relatorio completo de protecoes detectadas no servidor.
 *
 * E o documento final que resume todas as protecoes encontradas,
 * padroes de comportamento e o nivel de risco geral. Aparece como
 * uma secao especial nos resultados do teste.
 */
export interface ProtectionReport {
  /** Lista de todas as protecoes detectadas durante o teste. */
  detections: ProtectionDetection[]

  /** Informacoes sobre limitacao de taxa (rate limiting). */
  rateLimitInfo: RateLimitInfo

  /** Padroes de comportamento observados no servidor. */
  behavioralPatterns: BehavioralPattern[]

  /**
   * Nivel de risco geral.
   * Resume em uma unica palavra o impacto das protecoes nos resultados.
   */
  overallRisk: OverallRiskLevel

  /** Resumo em texto explicando os achados da analise. */
  summary: string

  /** Data/hora em que a analise foi realizada (formato ISO 8601). */
  analysisTimestamp: string
}


// ============================================================================
// 5. ESTADO DA APLICACAO
// ----------------------------------------------------------------------------
// Tipos que controlam a navegacao e o estado geral da interface.
// ============================================================================

/**
 * Telas disponiveis na aplicacao.
 *
 * - 'test': Tela principal para configurar e executar testes
 * - 'history': Historico de testes anteriores
 * - 'results': Visualizacao detalhada dos resultados de um teste
 */
export type AppView = 'test' | 'history' | 'results'

/**
 * Estado atual do teste.
 *
 * - 'idle': Parado, aguardando o usuario iniciar um teste
 * - 'running': Teste em execucao
 * - 'completed': Teste finalizado com sucesso
 * - 'cancelled': Teste cancelado pelo usuario
 * - 'error': Teste encerrado por erro
 */
export type TestStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error'


// ============================================================================
// 6. API GLOBAL (ELECTRON)
// ----------------------------------------------------------------------------
// O StressFlow e uma aplicacao desktop feita com Electron. A comunicacao
// entre a interface (frontend/React) e o sistema operacional (backend/Node.js)
// acontece por meio de uma ponte chamada "contextBridge".
//
// A interface abaixo descreve todas as funcoes que o frontend pode chamar
// para interagir com o sistema operacional, como iniciar testes, salvar
// arquivos PDF e acessar o historico de testes.
// ============================================================================

declare global {
  interface Window {
    stressflow: {
      /**
       * Modulo de execucao de testes.
       * Permite iniciar, cancelar e acompanhar o progresso de testes.
       */
      test: {
        /** Inicia um novo teste com a configuracao fornecida. Retorna o resultado ao finalizar. */
        start: (config: TestConfig) => Promise<TestResult>

        /** Cancela o teste em execucao. Retorna true se cancelado com sucesso. */
        cancel: () => Promise<boolean>

        /**
         * Registra um callback para receber atualizacoes de progresso a cada segundo.
         * Retorna uma funcao para cancelar o registro (unsubscribe).
         */
        onProgress: (callback: (data: ProgressData) => void) => () => void
      }

      /**
       * Modulo de historico de testes.
       * Permite consultar, buscar e gerenciar testes anteriores salvos localmente.
       */
      history: {
        /** Lista todos os testes salvos no historico. */
        list: () => Promise<TestResult[]>

        /** Busca um teste especifico pelo seu identificador. Retorna null se nao encontrado. */
        get: (id: string) => Promise<TestResult | null>

        /** Remove um teste do historico pelo seu identificador. */
        delete: (id: string) => Promise<boolean>

        /** Limpa todo o historico de testes. */
        clear: () => Promise<boolean>
      }

      /**
       * Modulo de exportacao PDF.
       * Permite salvar e abrir relatorios em formato PDF.
       */
      pdf: {
        /** Salva um PDF a partir de dados em base64. Retorna o caminho do arquivo salvo. */
        save: (base64: string, filename: string) => Promise<string>

        /** Abre um arquivo PDF no visualizador padrao do sistema operacional. */
        open: (filePath: string) => Promise<void>
      }

      /**
       * Modulo de exportacao JSON.
       * Permite exportar os resultados do teste em formato JSON.
       */
      json: {
        /**
         * Exporta dados JSON, abrindo dialogo para o usuario escolher onde salvar.
         * Retorna o caminho do arquivo ou null se o usuario cancelou.
         */
        export: (data: string, defaultName: string) => Promise<string | null>
      }

      /**
       * Modulo utilitario da aplicacao.
       */
      app: {
        /** Retorna o caminho do diretorio de dados da aplicacao no sistema. */
        getPath: () => Promise<string>
      }
    }
  }
}
