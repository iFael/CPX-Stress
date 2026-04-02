// ============================================================================
// StressFlow - Definicoes de Tipos
// ============================================================================
//
// Este arquivo contém todas as definicoes de tipos usadas no StressFlow.
// Cada tipo descreve a "forma" dos dados que circulam pela aplicação.
//
// Organizacao:
//   1. Configuração do Teste
//   2. Métricas e Progresso
//   3. Resultado do Teste
//   4. Motor de Detecção de Proteção
//   5. Estado da Aplicação
//   6. API Global (Electron)
// ============================================================================

import type { MeasurementReliability } from "@/shared/test-analysis";

// ============================================================================
// 1. CONFIGURAÇÃO DO TESTE
// ----------------------------------------------------------------------------
// Define os parâmetros que o usuário escolhe antes de iniciar um teste de
// estresse. Pense nisso como o "formulario" que o usuário preenche.
// ============================================================================

/** Métodos HTTP suportados para o teste (tipo de requisição ao servidor). */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * Uma operação individual dentro de um cenario de teste.
 *
 * Cada operação representa uma requisição HTTP especifica que os usuários
 * virtuais executam. Em modo multi-operação, os VUs executam as operações
 * em sequência (workflow), simulando um fluxo real de uso.
 *
 * Exemplo de fluxo MisterT: Login -> Dashboard -> Consulta Estoque -> Logout
 */
export interface TestOperation {
  /** Nome descritivo da operação (ex: "Login", "Consulta Estoque"). */
  name: string;

  /** URL completa do endpoint (ex: "https://dev-mistert.compex.com.br/login.asp"). */
  url: string;

  /** Método HTTP da requisição. */
  method: HttpMethod;

  /** Cabecalhos HTTP adicionais (opcional). */
  headers?: Record<string, string>;

  /** Corpo da requisição em texto (opcional). Usado em POST/PUT/DELETE. */
  body?: string;

  /**
   * Se verdadeiro, o engine captura os cookies Set-Cookie da resposta
   * e os propaga automaticamente para as operações seguintes do mesmo VU.
   * Essencial para sistemas baseados em sessão (ex: ASP Classic com ASPSESSIONID).
   */
  captureSession?: boolean;

  /**
   * Extracao de valores dinâmicos da resposta HTTP (Response Extraction).
   *
   * Chave = nome da variável (ex: "CTRL")
   * Valor = regex com grupo de captura (ex: "CTRL=(\\d+)")
   *
   * O primeiro grupo capturado e armazenado por VU e pode ser usado
   * nas operações seguintes via placeholder {{NOME}} em url, body e headers.
   * Essencial para aplicações com tokens dinâmicos por navegação.
   */
  extract?: Record<string, string>;
}

/**
 * Registro individual de um erro capturado durante o teste.
 * Armazenado no SQLite para pesquisa e análise posterior.
 */
export interface ErrorRecord {
  /** Identificador único do erro (UUID). */
  id: string;

  /** ID do teste ao qual este erro pertence. */
  testId: string;

  /** Timestamp do momento em que o erro ocorreu (milissegundos Unix). */
  timestamp: number;

  /** Nome da operação que gerou o erro (ou 'default' para teste single-URL). */
  operationName: string;

  /** Código de status HTTP retornado (0 para erros de conexão). */
  statusCode: number;

  /**
   * Tipo de erro:
   * - 'http': Resposta com status de erro (4xx, 5xx)
   * - 'timeout': Servidor não respondeu no tempo limite
   * - 'connection': Falha na conexão (ECONNREFUSED, ECONNRESET, etc.)
   * - 'dns': Falha na resolução DNS
   * - 'unknown': Erro não categorizado
   */
  errorType: "http" | "timeout" | "connection" | "dns" | "unknown";

  /** Mensagem de erro legível. */
  message: string;

  /** Primeiros bytes da resposta do servidor (para diagnóstico). */
  responseSnippet?: string;
}

/**
 * Métricas agregadas de uma operação individual dentro de um teste multi-operação.
 */
export interface OperationMetrics {
  /** Nome da operação. */
  name: string;

  /** Total de requisições enviadas para esta operação. */
  totalRequests: number;

  /** Total de erros nesta operação. */
  totalErrors: number;

  /** Taxa de erro em porcentagem. */
  errorRate: number;

  /** Requisições por segundo desta operação. */
  rps: number;

  /** Estatísticas de latência desta operação. */
  latency: {
    avg: number;
    min: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    max: number;
  };

  /** Contagem de status codes desta operação. */
  statusCodes: Record<string, number>;

  /** Métricas de consistencia de sessão (quando captureSession esta ativo). */
  sessionMetrics?: {
    /** Requisições bem-sucedidas em fluxo autenticado. */
    authenticatedRequests: number;

    /** Falhas de sessão detectadas na operação. */
    sessionFailures: number;

    /** Erros tipicos de sessão expirada (401/403). */
    sessionExpiredErrors: number;

    /** Score de consistencia do fluxo de sessão em porcentagem. */
    consistencyScore: number;
  };
}

/**
 * Configuração do teste de estresse.
 *
 * Contém todos os parâmetros que o usuário define antes de rodar o teste,
 * como a URL alvo, número de usuários simulados e duração.
 */
export interface TestConfig {
  /** URL do servidor que sera testado (ex: "https://meusite.com.br/api"). */
  url: string;

  /**
   * Quantidade de usuários virtuais (simultâneos) simulados.
   * Cada usuário virtual envia requisições de forma independente,
   * como se fossem pessoas reais acessando o site ao mesmo tempo.
   */
  virtualUsers: number;

  /** Duração total do teste em segundos. */
  duration: number;

  /**
   * Método HTTP da requisição.
   * - GET: buscar dados (mais comum)
   * - POST: enviar dados novos
   * - PUT: atualizar dados existentes
   * - DELETE: remover dados
   */
  method: HttpMethod;

  /**
   * Cabecalhos HTTP adicionais (opcional).
   * Usados para enviar informações extras, como tokens de autenticação.
   * Exemplo: { "Authorization": "Bearer abc123" }
   */
  headers?: Record<string, string>;

  /**
   * Corpo da requisição em texto (opcional).
   * Usado em requisições POST e PUT para enviar dados ao servidor,
   * geralmente em formato JSON.
   */
  body?: string;

  /**
   * Tempo de rampa em segundos (opcional).
   * Ao inves de iniciar todos os usuários de uma vez, eles são adicionados
   * gradualmente durante esse período. Isso simula um crescimento natural
   * de trafego, evitando um "choque" inicial no servidor.
   */
  rampUp?: number;

  /**
   * Lista de operações para teste multi-operação (opcional).
   * Quando presente, os VUs executam essas operações em sequência,
   * simulando um fluxo real de uso (ex: login -> navegar -> logout).
   * Se não informado, o teste usa url/method/headers/body como operação unica.
   */
  operations?: TestOperation[];
}

// ============================================================================
// 2. MÉTRICAS E PROGRESSO
// ----------------------------------------------------------------------------
// Dados coletados durante a execução do teste. A cada segundo, o sistema
// registra métricas como quantidade de requisições, erros e tempos de resposta.
// ============================================================================

/**
 * Métricas coletadas em um único segundo do teste.
 *
 * A cada segundo, o sistema tira uma "fotografia" do desempenho do servidor,
 * registrando quantas requisições foram feitas, quantas falharam,
 * e o quao rapido o servidor respondeu.
 */
export interface SecondMetrics {
  /** Momento exato da medicao em milissegundos (timestamp Unix). */
  timestamp: number;

  /** Número do segundo dentro do teste (1, 2, 3...). */
  second: number;

  /** Total de requisições completadas neste segundo. */
  requests: number;

  /** Total de requisições que falharam neste segundo. */
  errors: number;

  /**
   * Tempo medio de resposta (latência) em milissegundos.
   * Quanto menor, mais rapido o servidor respondeu.
   */
  latencyAvg: number;

  /**
   * Percentil 50 (mediana) da latência em ms.
   * Metade das requisições foram mais rapidas que esse valor.
   */
  latencyP50: number;

  /**
   * Percentil 90 da latência em ms.
   * 90% das requisições foram mais rapidas que esse valor.
   * Util para entender a experiência da maioria dos usuários.
   */
  latencyP90: number;

  /**
   * Percentil 95 da latência em ms.
   * Apenas 5% das requisições foram mais lentas que isso.
   */
  latencyP95: number;

  /**
   * Percentil 99 da latência em ms.
   * Apenas 1% das requisições foram mais lentas que isso.
   * Mostra os piores casos de desempenho.
   */
  latencyP99: number;

  /** Maior tempo de resposta registrado neste segundo (ms). */
  latencyMax: number;

  /** Menor tempo de resposta registrado neste segundo (ms). */
  latencyMin: number;

  /**
   * Contagem de respostas por código de status HTTP.
   * Exemplo: { "200": 95, "500": 5 } indica 95 sucessos e 5 erros internos.
   *
   * Códigos comuns:
   * - 200: Sucesso
   * - 301/302: Redirecionamento
   * - 403: Acesso negado
   * - 429: Muitas requisições (rate limit)
   * - 500: Erro interno do servidor
   * - 503: Servidor indisponivel
   */
  statusCodes: Record<string, number>;

  /** Total de bytes (dados) recebidos do servidor neste segundo. */
  bytesReceived: number;

  /** Número de usuários virtuais ativos neste segundo. */
  activeUsers: number;
}

/**
 * Dados de progresso do teste em tempo real.
 *
 * Enviado a cada segundo para a interface, permitindo que o usuário
 * acompanhe a evolucao do teste enquanto ele acontece.
 */
export interface ProgressData {
  /** Segundo atual do teste (ex: 15 de 30). */
  currentSecond: number;

  /** Duração total planejada do teste em segundos. */
  totalSeconds: number;

  /** Métricas detalhadas do segundo atual. */
  metrics: SecondMetrics;

  /**
   * Métricas acumuladas desde o início do teste.
   * Diferente das métricas por segundo, estas somam tudo ate o momento.
   */
  cumulative: {
    /** Total de requisições feitas desde o início do teste. */
    totalRequests: number;

    /** Total de erros desde o início do teste. */
    totalErrors: number;

    /** Requisições por segundo (media acumulada). */
    rps: number;
  };
}

// ============================================================================
// 3. RESULTADO DO TESTE
// ----------------------------------------------------------------------------
// Resumo completo gerado após a finalizacao de um teste. Contém todas as
// métricas consolidadas, a linha do tempo completa e o relatório de proteção.
// ============================================================================

/**
 * Status final de um teste: se terminou com sucesso, foi cancelado
 * pelo usuário ou ocorreu um erro inesperado.
 */
export type TestResultStatus = "completed" | "cancelled" | "error";

/**
 * Resultado completo de um teste de estresse.
 *
 * Contém o resumo final com todas as métricas consolidadas, incluindo
 * velocidade media de resposta, taxa de erros, e a linha do tempo
 * completa segundo a segundo. E o "relatório final" do teste.
 */
export interface TestResult {
  /** Identificador único do teste (UUID gerado automaticamente). */
  id: string;

  /** URL que foi testada. */
  url: string;

  /** Configuração usada para rodar este teste. */
  config: TestConfig;

  /** Data/hora de início do teste (formato ISO 8601). */
  startTime: string;

  /** Data/hora de termino do teste (formato ISO 8601). */
  endTime: string;

  /** Duração real do teste em segundos (pode diferir se foi cancelado). */
  durationSeconds: number;

  /** Número total de requisições enviadas durante o teste. */
  totalRequests: number;

  /** Número total de requisições que falharam. */
  totalErrors: number;

  /**
   * Requisições por segundo (RPS) - taxa media de vazao.
   * Indica quantas requisições o servidor conseguiu processar por segundo.
   * Quanto maior, melhor o desempenho.
   */
  rps: number;

  /**
   * Estatísticas de latência (tempo de resposta) consolidadas.
   * Todos os valores são em milissegundos (ms).
   */
  latency: {
    /** Tempo medio de resposta. */
    avg: number;

    /** Tempo de resposta mais rapido registrado. */
    min: number;

    /** Mediana: metade das respostas foram mais rapidas que isso. */
    p50: number;

    /** 90% das respostas foram mais rapidas que isso. */
    p90: number;

    /** 95% das respostas foram mais rapidas que isso. */
    p95: number;

    /** 99% das respostas foram mais rapidas que isso. */
    p99: number;

    /** Tempo de resposta mais lento registrado. */
    max: number;
  };

  /**
   * Taxa de erros em porcentagem (0 a 100).
   * Exemplo: 2.5 significa que 2,5% das requisições falharam.
   */
  errorRate: number;

  /**
   * Vazao de dados em bytes por segundo.
   * Indica o volume de dados transferidos por segundo.
   */
  throughputBytesPerSec: number;

  /** Total de bytes (dados) recebidos durante todo o teste. */
  totalBytes: number;

  /**
   * Contagem total de respostas agrupadas por código de status HTTP.
   * Exemplo: { "200": 9500, "429": 300, "500": 200 }
   */
  statusCodes: Record<string, number>;

  /**
   * Linha do tempo completa: métricas de cada segundo do teste.
   * Usada para gerar gráficos e identificar padrões ao longo do tempo.
   */
  timeline: SecondMetrics[];

  /** Status final do teste (concluido, cancelado ou erro). */
  status: TestResultStatus;

  /** Mensagem de erro detalhada, presente apenas se o teste falhou. */
  errorMessage?: string;

  /**
   * Relatório de detecção de protecoes (opcional).
   * Identifica se o servidor possui WAF, CDN, rate limiting, etc.
   * So e gerado se protecoes foram detectadas.
   */
  protectionReport?: ProtectionReport;

  /**
   * Métricas individuais por operação (opcional).
   * Presente apenas em testes multi-operação. Cada chave e o nome da operação
   * e o valor contém as métricas consolidadas daquela operação.
   */
  operationMetrics?: Record<string, OperationMetrics>;

  /**
   * Indica se o próprio gerador de carga permaneceu confiavel durante o teste.
   * Quando degradado ou saturado, os resultados ainda ajudam, mas merecem leitura cuidadosa.
   */
  measurementReliability?: MeasurementReliability;

  /**
   * Avisos operacionais complementares sobre a qualidade da medicao.
   * Exemplo: reservoir sampling ativo, RPS instavel, timeouts no cliente.
   */
  operationalWarnings?: string[];

  /**
   * Distribuição dos erros por tipo.
   * Permite entender a natureza das falhas: se são timeouts do cliente,
   * problemas de conexão, erros HTTP do servidor, falhas DNS, etc.
   */
  errorBreakdown?: {
    timeout: number;
    connection: number;
    http: number;
    dns: number;
    unknown: number;
  };
}

// ============================================================================
// 4. MOTOR DE DETECÇÃO DE PROTEÇÃO
// ----------------------------------------------------------------------------
// O StressFlow analisa as respostas do servidor para identificar mecanismos
// de proteção como firewalls (WAF), CDNs, limitadores de taxa e protecoes
// anti-bot. Isso ajuda o usuário a entender por que o servidor pode estar
// bloqueando ou limitando as requisições durante o teste.
// ============================================================================

// --- 4.1 Classificações e Enumeracoes ---

/**
 * Tipo de proteção detectada no servidor alvo.
 *
 * - 'waf': Firewall de Aplicação Web - filtra trafego malicioso
 * - 'cdn': Rede de Distribuição de Conteúdo - distribui carga geograficamente
 * - 'rate-limiter': Limitador de taxa - restringe requisições por período
 * - 'anti-bot': Proteção contra robos automatizados
 * - 'ddos-protection': Proteção contra ataques de negacao de serviço
 * - 'captcha': Desafio visual para provar que o visitante e humano
 * - 'unknown': Proteção detectada mas não identificada
 */
export type ProtectionType =
  | "waf"
  | "cdn"
  | "rate-limiter"
  | "anti-bot"
  | "ddos-protection"
  | "captcha"
  | "unknown";

/**
 * Fornecedor/empresa responsável pela proteção detectada.
 *
 * Inclui os principais provedores de seguranca e infraestrutura web:
 * - Cloudflare, Akamai, Fastly: CDNs e WAFs populares
 * - Imperva, Sucuri: Especializados em seguranca web
 * - AWS WAF/CloudFront, Azure Front Door, Google Cloud Armor: Nuvens publicas
 * - DDoS-Guard, StackPath: Proteção contra DDoS
 * - Varnish, Nginx: Servidores proxy/cache
 * - 'custom': Solucao proprietaria da empresa
 * - 'unknown': Não foi possível identificar o fornecedor
 */
export type ProtectionProvider =
  | "cloudflare"
  | "akamai"
  | "fastly"
  | "imperva"
  | "sucuri"
  | "aws-waf"
  | "aws-cloudfront"
  | "azure-frontdoor"
  | "google-cloud-armor"
  | "ddos-guard"
  | "stackpath"
  | "varnish"
  | "nginx"
  | "custom"
  | "unknown";

/**
 * Nivel de confianca na detecção.
 *
 * - 'high': Alta certeza - multiplos indicadores claros confirmam a detecção
 * - 'medium': Certeza moderada - alguns indicadores sugerem a proteção
 * - 'low': Baixa certeza - poucos indicios, pode ser um falso positivo
 */
export type ConfidenceLevel = "high" | "medium" | "low";

// --- 4.2 Indicadores e Deteccoes ---

/**
 * Um indicador individual que sugere a presenca de uma proteção.
 *
 * Pense nisso como uma "pista" encontrada nas respostas do servidor.
 * Por exemplo, um cabeçalho "cf-ray" indica uso de Cloudflare.
 */
export interface ProtectionIndicator {
  /**
   * Onde a pista foi encontrada:
   * - 'header': Nos cabecalhos da resposta HTTP
   * - 'cookie': Nos cookies enviados pelo servidor
   * - 'status-code': No código de status da resposta (ex: 403, 429)
   * - 'body': No conteúdo/corpo da resposta
   * - 'behavior': No padrão de comportamento do servidor ao longo do tempo
   * - 'timing': Nos tempos de resposta (ex: latência crescente)
   */
  source: "header" | "cookie" | "status-code" | "body" | "behavior" | "timing";

  /** Nome do indicador (ex: "cf-ray", "x-sucuri-id"). */
  name: string;

  /** Valor encontrado (ex: "7a1b2c3d4e-GRU"). */
  value: string;

  /** Explicacao legível do que este indicador significa. */
  detail: string;
}

/**
 * Uma detecção completa de proteção.
 *
 * Agrega todas as pistas (indicadores) que levaram a conclusão de que
 * determinada proteção esta ativa no servidor.
 */
export interface ProtectionDetection {
  /** Tipo de proteção identificada (WAF, CDN, rate limiter, etc.). */
  type: ProtectionType;

  /** Fornecedor/empresa responsável pela proteção. */
  provider: ProtectionProvider;

  /**
   * Nivel de confianca numerico da detecção (0 a 100).
   * Quanto maior, mais certeza temos de que a proteção esta presente.
   */
  confidence: number;

  /** Nivel de confianca categorizado (alto, medio ou baixo). */
  confidenceLevel: ConfidenceLevel;

  /** Lista de indicadores (pistas) que sustentam esta detecção. */
  indicators: ProtectionIndicator[];

  /** Descrição resumida da proteção detectada em linguagem acessível. */
  description: string;
}

// --- 4.3 Rate Limiting e Padrões Comportamentais ---

/**
 * Informações sobre limitacao de taxa (rate limiting) detectada.
 *
 * Rate limiting e quando o servidor limita quantas requisições você
 * pode fazer em determinado período. E como um "caixa de supermercado"
 * que so atende X clientes por minuto.
 */
export interface RateLimitInfo {
  /** Se foi detectado algum tipo de limitacao de taxa. */
  detected: boolean;

  /**
   * Segundo do teste em que a limitacao comecou a agir (opcional).
   * Exemplo: se o valor for 15, o servidor comecou a limitar no 15o segundo.
   */
  triggerPoint?: number;

  /**
   * Limite de requisições por janela de tempo (opcional).
   * Exemplo: "100 requisições por janela".
   */
  limitPerWindow?: string;

  /**
   * Duração da janela de tempo em segundos (opcional).
   * Exemplo: 60 significa que o limite se aplica a cada 60 segundos.
   */
  windowSeconds?: number;

  /**
   * Padrão de recuperação observado (opcional).
   * Descreve como o servidor volta ao normal após aplicar o limite.
   * Exemplo: "Recuperação gradual após 30 segundos".
   */
  recoveryPattern?: string;
}

/**
 * Padrão de comportamento do servidor observado durante o teste.
 *
 * Descreve como o servidor reagiu ao volume de requisições,
 * ajudando a entender suas estrategias de defesa.
 */
export interface BehavioralPattern {
  /**
   * Tipo de comportamento observado:
   * - 'throttling': Servidor desacelerando as respostas intencionalmente
   * - 'blocking': Servidor bloqueando requisições completamente
   * - 'challenge': Servidor exigindo verificação (ex: captcha)
   * - 'degradation': Servidor perdendo desempenho gradualmente
   * - 'normal': Servidor respondendo normalmente, sem sinais de proteção
   */
  type: "throttling" | "blocking" | "challenge" | "degradation" | "normal";

  /** Descrição legível do padrão observado. */
  description: string;

  /** Segundo do teste em que o padrão foi observado pela primeira vez. */
  startSecond?: number;

  /** Evidencia que sustenta a identificacao deste padrão. */
  evidence: string;
}

// --- 4.4 Relatório Consolidado ---

/**
 * Nivel de risco geral identificado nas protecoes do servidor.
 *
 * Indica o quanto as protecoes detectadas podem impactar o teste:
 * - 'none': Nenhuma proteção detectada
 * - 'low': Protecoes minimas que provavelmente não afetam o teste
 * - 'medium': Protecoes moderadas que podem afetar parcialmente os resultados
 * - 'high': Protecoes significativas que provavelmente afetam os resultados
 * - 'critical': Protecoes fortes que bloqueiam a maioria das requisições
 */
export type OverallRiskLevel = "none" | "low" | "medium" | "high" | "critical";

/**
 * Relatório completo de protecoes detectadas no servidor.
 *
 * E o documento final que resume todas as protecoes encontradas,
 * padrões de comportamento e o nivel de risco geral. Aparece como
 * uma secao especial nos resultados do teste.
 */
export interface ProtectionReport {
  /** Lista de todas as protecoes detectadas durante o teste. */
  detections: ProtectionDetection[];

  /** Informações sobre limitacao de taxa (rate limiting). */
  rateLimitInfo: RateLimitInfo;

  /** Padrões de comportamento observados no servidor. */
  behavioralPatterns: BehavioralPattern[];

  /**
   * Nivel de risco geral.
   * Resume em uma unica palavra o impacto das protecoes nos resultados.
   */
  overallRisk: OverallRiskLevel;

  /** Resumo em texto explicando os achados da análise. */
  summary: string;

  /** Data/hora em que a análise foi realizada (formato ISO 8601). */
  analysisTimestamp: string;
}

// ============================================================================
// 5. ESTADO DA APLICAÇÃO
// ----------------------------------------------------------------------------
// Tipos que controlam a navegação e o estado geral da interface.
// ============================================================================

/**
 * Telas disponiveis na aplicação.
 *
 * - 'test': Tela principal para configurar e executar testes
 * - 'history': Histórico de testes anteriores
 * - 'results': Visualização detalhada dos resultados de um teste
 */
export type AppView = "test" | "history" | "results";

/**
 * Estado atual do teste.
 *
 * - 'idle': Parado, aguardando o usuário iniciar um teste
 * - 'running': Teste em execução
 * - 'completed': Teste finalizado com sucesso
 * - 'cancelled': Teste cancelado pelo usuário
 * - 'error': Teste encerrado por erro
 */
export type TestStatus =
  | "idle"
  | "running"
  | "completed"
  | "cancelled"
  | "error";

// ============================================================================
// 6. API GLOBAL (ELECTRON)
// ----------------------------------------------------------------------------
// O StressFlow e uma aplicação desktop feita com Electron. A comunicação
// entre a interface (frontend/React) e o sistema operacional (backend/Node.js)
// acontece por meio de uma ponte chamada "contextBridge".
//
// A interface abaixo descreve todas as funções que o frontend pode chamar
// para interagir com o sistema operacional, como iniciar testes, salvar
// arquivos PDF e acessar o histórico de testes.
// ============================================================================

declare global {
  interface Window {
    stressflow: {
      /**
       * Módulo de execução de testes.
       * Permite iniciar, cancelar e acompanhar o progresso de testes.
       */
      test: {
        /** Inicia um novo teste com a configuração fornecida. Retorna o resultado ao finalizar. */
        start: (config: TestConfig) => Promise<TestResult>;

        /** Cancela o teste em execução. Retorna true se cancelado com sucesso. */
        cancel: () => Promise<boolean>;

        /**
         * Registra um callback para receber atualizacoes de progresso a cada segundo.
         * Retorna uma função para cancelar o registro (unsubscribe).
         */
        onProgress: (callback: (data: ProgressData) => void) => () => void;
      };

      /**
       * Módulo de histórico de testes.
       * Permite consultar, buscar e gerenciar testes anteriores salvos localmente.
       */
      history: {
        /** Lista todos os testes salvos no histórico. */
        list: () => Promise<TestResult[]>;

        /** Busca um teste específico pelo seu identificador. Retorna null se não encontrado. */
        get: (id: string) => Promise<TestResult | null>;

        /** Remove um teste do histórico pelo seu identificador. */
        delete: (id: string) => Promise<boolean>;

        /** Limpa todo o histórico de testes. */
        clear: () => Promise<boolean>;
      };

      /**
       * Módulo de exportação PDF.
       * Permite salvar e abrir relatórios em formato PDF.
       */
      pdf: {
        /** Salva um PDF a partir de dados em base64. Retorna o caminho do arquivo salvo. */
        save: (base64: string, filename: string) => Promise<string>;

        /** Abre um arquivo PDF no visualizador padrão do sistema operacional. */
        open: (filePath: string) => Promise<void>;
      };

      /**
       * Módulo de exportação JSON.
       * Permite exportar os resultados do teste em formato JSON.
       */
      json: {
        /**
         * Exporta dados JSON, abrindo dialogo para o usuário escolher onde salvar.
         * Retorna o caminho do arquivo ou null se o usuário cancelou.
         */
        export: (data: string, defaultName: string) => Promise<string | null>;
      };

      /**
       * Módulo utilitario da aplicação.
       */
      app: {
        /** Retorna o caminho do diretorio de dados da aplicação no sistema. */
        getPath: () => Promise<string>;
      };

      /**
       * Módulo de pesquisa e consulta de erros detalhados.
       * Permite buscar, filtrar e analisar erros individuais
       * armazenados no SQLite.
       */
      errors: {
        /** Busca erros de um teste específico com filtros opcionais. */
        search: (params: {
          testId?: string;
          statusCode?: number;
          errorType?: string;
          limit?: number;
          offset?: number;
        }) => Promise<{ records: ErrorRecord[]; total: number }>;

        /** Retorna contagem de erros agrupados por status code para um teste. */
        byStatusCode: (testId: string) => Promise<Record<string, number>>;

        /** Retorna contagem de erros agrupados por tipo para um teste. */
        byErrorType: (testId: string) => Promise<Record<string, number>>;
      };
    };
  }
}
